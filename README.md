# Urbania Premium Travels — PWA

React + Vite + TypeScript + Tailwind + Supabase. Customers configure a 16-seater trip, see an itemised estimated fare, and submit a request that an admin approves or rejects.

## 1. Run it

```bash
npm install
cp .env.example .env      # fill in values
npm run dev
```

## 2. Supabase setup

1. Create a project. In **Auth → Providers** enable **Phone** (Twilio/MSG91 etc.) and in **Auth → Sign In / Providers** enable **Anonymous sign-ins** (powers guest booking).
2. Run `supabase/migrations/001_schema.sql` in the SQL editor. It creates all tables, RLS policies, the server-side `create_booking`, `admin_decide_booking` and `admin_record_toll` functions, seed permit fees and realtime publications.
3. Create the admin: Auth → Users → Add user (email + password), then run:
   ```sql
   insert into public.admin_users (user_id, email)
   select id, email from auth.users where email = 'you@example.com';
   ```
4. Put the project URL and anon key in `.env`.

## 3. SMS notifications (optional but recommended)

```bash
supabase functions deploy send-sms --no-verify-jwt
supabase secrets set WEBHOOK_SECRET=... SMS_PROVIDER=msg91 MSG91_AUTH_KEY=... MSG91_TEMPLATE_ID=...
```
Then Database → Webhooks: table `notifications`, event `INSERT`, target the function, header `x-webhook-secret: <WEBHOOK_SECRET>`.
Every booking event already writes a `notifications` row, so in-app alerts work without this step.

## 4. Google Maps (optional)

Set `VITE_GOOGLE_MAPS_KEY` (restrict by HTTP referrer; enable Places API and Distance Matrix API / Maps JavaScript API). Distance and state permits are detected automatically and customers cannot edit them. Without a key (or if Google is unreachable) the booking screen shows "Try again / Call us to book" instead of letting the customer type a distance. Also enable the Directions and Geocoding APIs for the browser key.

## 3b. Distance verification (recommended)

The customer's distance comes from the Google Maps route lookup in the browser. To check it independently, a background function re-measures every leg server-side after the booking is created:

```bash
supabase functions deploy verify-distance --no-verify-jwt
supabase secrets set GOOGLE_MAPS_SERVER_KEY=... WEBHOOK_SECRET=...
```
Then Database → Webhooks: table `bookings`, event `INSERT`, target `verify-distance`, header `x-webhook-secret: <WEBHOOK_SECRET>`. Use a second Google key for this (restricted to the Distance Matrix API and, if you can, to Supabase's IPs), not the browser key. The function also re-detects the states the route passes through (Directions + Geocoding APIs; enable both on the server key) and the admin page warns if a state's permit tax was not charged. The result shows on the admin booking page as verified, mismatch (more than 3% or 5 km apart) or unavailable. On a mismatch the admin can re-price with one click, `Use Google distance`.

## How the important parts work

- **Fare model**: distance fare (route km × ₹/km, default ₹35) + extra state permits + day bata (₹600 × days) + night bata (₹400 × nights). There is no luggage charge, service charge or GST, and no per-seat price (seats and luggage only record group size). Nights = days − 1 and night bata applies to every night, driven or halted. Trip type is One way, Round trip or Multi-city (up to 8 stops). Each leg gets its own road distance, looked up via Google Maps when a key is set, and the legs are summed for billing; a round trip is priced as two legs (A→B plus B→A), so the distance is the actual route out and back, e.g. Mysore → Pondicherry → Mysore ≈ 903 km × ₹35 = ₹31,605. Distance is worked out first, then priced. All rates are editable in Fare Config.
- **State permit tax** is each state's own tourist-vehicle tax, stored per state with a basis (per trip, per day, per 7 days, per 30 days) and charged accordingly (e.g. Goa per day × trip days, Maharashtra per 30 days). The seeded rates are what operators publish for a 16-seater and start **unverified**: confirm each against the state's current notification or a receipt, then tick Verified in Fare Config. States change these rates, so review them periodically.
- **Dates**: there is one van, so a day that anyone has booked (pending or approved) shows crossed out in the date picker for everybody, with no details of who booked it. `create_booking` enforces this again under a lock, so two people cannot take the same dates at once. Rejecting a booking frees its dates.
- **Fares** live in `fare_configurations` and `state_permits` (editable at `/admin/fares`). The browser shows a live estimate, but `create_booking` recalculates everything in Postgres and the client cannot write to `bookings` directly.
- **Toll tax is not estimated.** It is excluded from the up-front total and billed at actuals. After the trip, once the toll statement arrives, the admin opens the approved booking, enters the actual toll under "Toll tax (after trip)" and the final bill (`final_total`) is updated and the customer notified (`admin_record_toll`).
- **Guests** use Supabase anonymous sessions, so they can submit and track bookings from the same device. Guest bookings are not merged into a phone account if they later log in.
- **Security**: RLS on every table; customers only read their own rows; admin actions require `admin_users` membership and run in security-definer functions; duplicate submissions within 5 minutes are collapsed; OTP rate limiting is configured in Supabase Auth settings.
- **Push**: in-app/browser notifications are shown while the app is open or backgrounded (service worker). True background Web Push needs a VAPID-signed sender; the `profiles.push_subscription` column is ready for it.

## Routes

`/splash /onboarding /auth/login /home /booking/step-1..4 /booking/confirmation /bookings /bookings/:id /profile /notifications /terms /admin/login /admin/dashboard /admin/booking/:id /admin/fares`

## Not verified here

This code was written without being able to install packages or run the build in the authoring environment. Expect to run `npm run build` once and fix any small type errors, then test the flows in section 25 of your plan against a real Supabase project.
