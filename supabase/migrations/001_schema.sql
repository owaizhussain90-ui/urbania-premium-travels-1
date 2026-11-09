-- Urbania Premium Travels — Supabase schema
-- Run in Supabase SQL editor. Enable "Anonymous sign-ins" (guest mode) and Phone auth in Auth settings.

create extension if not exists pgcrypto;

-- ───────────── Tables ─────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  push_enabled boolean not null default false,
  push_subscription jsonb,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  name text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

-- Single-row fare configuration (id is always 1)
create table public.fare_configurations (
  id int primary key default 1 check (id = 1),
  per_km_rate numeric(10,2) not null default 35,
  day_bata_per_day numeric(10,2) not null default 600,
  night_bata_per_night numeric(10,2) not null default 400,
  updated_at timestamptz not null default now()
);
insert into public.fare_configurations (id) values (1);

create table public.state_permits (
  state text primary key,
  fee numeric(10,2) not null default 0,
  basis text not null default 'per_trip' check (basis in ('per_trip','per_day','per_7_days','per_30_days')),
  verified boolean not null default false,
  active boolean not null default true
);

-- A state's tax for a trip of p_days, per how that state charges it.
create or replace function public.permit_charge(p_fee numeric, p_basis text, p_days int) returns numeric
language sql immutable as $$
  select p_fee * case p_basis when 'per_day' then greatest(p_days,1)
                              when 'per_7_days' then ceil(greatest(p_days,1) / 7.0)
                              when 'per_30_days' then ceil(greatest(p_days,1) / 30.0)
                              else 1 end
$$;

create sequence public.booking_seq start 1;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null unique,
  user_id uuid not null references auth.users(id),
  customer_id uuid references public.customers(id),
  customer_name text not null,
  phone text not null,
  email text,
  pickup text not null,
  dropoff text not null,
  start_date date not null,
  end_date date not null,
  duration_days int not null check (duration_days between 1 and 60),
  special_requests text,
  distance_km numeric(8,1) not null default 0,
  trip_type text not null default 'one_way' check (trip_type in ('one_way','round_trip','multi_city')),
  billed_km numeric(8,1) not null default 0,
  -- Independent re-measurement of the route by Google Maps (server side, in the background)
  verified_km numeric(8,1),
  verified_leg_km jsonb,
  verified_states text[],   -- states the route really passes through, per Google
  distance_check text not null default 'pending' check (distance_check in ('pending','verified','mismatch','unavailable')),
  verified_at timestamptz,
  stops jsonb not null default '[]'::jsonb,
  leg_km jsonb not null default '[]'::jsonb,
  seat_count int not null check (seat_count between 1 and 16),
  small_bags int not null default 0 check (small_bags between 0 and 16),
  large_bags int not null default 0 check (large_bags between 0 and 8),
  oversized_items int not null default 0 check (oversized_items between 0 and 4),
  base_fare numeric(12,2) not null,        -- distance fare
  permit_charge numeric(12,2) not null,
  day_bata numeric(12,2) not null,
  night_bata numeric(12,2) not null,
  driver_bata numeric(12,2) not null,      -- day_bata + night_bata
  toll_tax numeric(12,2) not null default 0,  -- actual toll, recorded by admin after the trip
  toll_recorded_at timestamptz,
  total_estimate numeric(12,2) not null,   -- excludes toll
  final_total numeric(12,2),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  admin_override boolean not null default false,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index on public.bookings (user_id, created_at desc);
create index on public.bookings (status, created_at desc);

create table public.booking_seats (
  booking_id uuid references public.bookings(id) on delete cascade,
  seat_no int check (seat_no between 1 and 16),
  primary key (booking_id, seat_no)
);

create table public.booking_luggage (
  booking_id uuid references public.bookings(id) on delete cascade,
  luggage_type text check (luggage_type in ('small','large','oversized')),
  quantity int not null,
  primary key (booking_id, luggage_type)
);

create table public.booking_permits (
  booking_id uuid references public.bookings(id) on delete cascade,
  state text not null,
  fee numeric(10,2) not null,
  primary key (booking_id, state)
);

create table public.booking_status_history (
  id bigserial primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  status text not null,
  note text,
  changed_by uuid,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  phone text,
  title text not null,
  body text not null,
  kind text not null default 'booking',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

-- ───────────── Helpers ─────────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger bookings_touch before update on public.bookings
for each row execute function public.touch_updated_at();

-- ───────────── Row Level Security ─────────────
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.admin_users enable row level security;
alter table public.fare_configurations enable row level security;
alter table public.state_permits enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_seats enable row level security;
alter table public.booking_luggage enable row level security;
alter table public.booking_permits enable row level security;
alter table public.booking_status_history enable row level security;
alter table public.notifications enable row level security;

create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own customer" on public.customers for select using (user_id = auth.uid() or public.is_admin());
create policy "admin self check" on public.admin_users for select using (user_id = auth.uid());

create policy "read fare config" on public.fare_configurations for select using (auth.uid() is not null);
create policy "admin writes fare config" on public.fare_configurations for update using (public.is_admin()) with check (public.is_admin());

create policy "read permits" on public.state_permits for select using (auth.uid() is not null);
create policy "admin writes permits" on public.state_permits for all using (public.is_admin()) with check (public.is_admin());

-- Bookings: read-only for clients. All writes go through security-definer functions below.
create policy "own or admin bookings" on public.bookings for select using (user_id = auth.uid() or public.is_admin());
create policy "own seats" on public.booking_seats for select using (exists (select 1 from public.bookings b where b.id = booking_id and (b.user_id = auth.uid() or public.is_admin())));
create policy "own luggage" on public.booking_luggage for select using (exists (select 1 from public.bookings b where b.id = booking_id and (b.user_id = auth.uid() or public.is_admin())));
create policy "own permits" on public.booking_permits for select using (exists (select 1 from public.bookings b where b.id = booking_id and (b.user_id = auth.uid() or public.is_admin())));
create policy "own history" on public.booking_status_history for select using (exists (select 1 from public.bookings b where b.id = booking_id and (b.user_id = auth.uid() or public.is_admin())));

create policy "own notifications read" on public.notifications for select using (user_id = auth.uid());
create policy "own notifications update" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admin notifications read" on public.notifications for select using (public.is_admin());

-- ───────────── Dates already taken (dates only, no personal details) ─────────────
-- Customers cannot read other people's bookings (RLS), so this security-definer function exposes only the
-- list of unavailable days. Pending requests hold their dates; a rejection frees them again.
create or replace function public.unavailable_dates() returns table(day date)
language sql stable security definer set search_path = public as $$
  select distinct d::date
    from public.bookings b, generate_series(b.start_date, b.end_date, interval '1 day') d
   where b.status in ('pending','approved') and b.end_date >= (now() at time zone 'Asia/Kolkata')::date
$$;
revoke all on function public.unavailable_dates() from public;
grant execute on function public.unavailable_dates() to anon, authenticated;

-- ───────────── Server-side booking creation (fare recalculated here) ─────────────
create or replace function public.create_booking(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cfg public.fare_configurations%rowtype;
  v_name text := left(btrim(coalesce(p->>'customer_name','')), 100);
  v_phone text := regexp_replace(coalesce(p->>'phone',''), '[^0-9+]', '', 'g');
  v_email text := nullif(left(btrim(coalesce(p->>'email','')), 150), '');
  v_pickup text := left(btrim(coalesce(p->>'pickup','')), 250);
  v_drop text := left(btrim(coalesce(p->>'dropoff','')), 250);
  v_notes text := nullif(left(btrim(coalesce(p->>'special_requests','')), 1000), '');
  v_start date := (p->>'start_date')::date;
  v_end date := (p->>'end_date')::date;
  v_days int; v_nights int;
  v_dist numeric := least(greatest(coalesce((p->>'distance_km')::numeric, 0), 0), 6000);
  v_seats int[];
  v_small int := coalesce((p->>'small_bags')::int, 0);
  v_large int := coalesce((p->>'large_bags')::int, 0);
  v_over int := coalesce((p->>'oversized_items')::int, 0);
  v_states text[];
  v_trip text := case p->>'trip_type' when 'round_trip' then 'round_trip' when 'multi_city' then 'multi_city' else 'one_way' end;
  v_bill numeric;
  v_stops jsonb := '[]'::jsonb; v_legs numeric[] := '{}'; v_leg numeric;
  v_base numeric; v_permit numeric; v_dbata numeric; v_nbata numeric; v_total numeric;
  v_cust uuid; v_id uuid; v_ref text; v_existing record; seat int;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if v_name = '' or length(v_name) < 2 then raise exception 'Name is required'; end if;
  if v_phone !~ '^\+?[0-9]{10,13}$' then raise exception 'Invalid phone number'; end if;
  if v_pickup = '' or v_drop = '' then raise exception 'Pickup and drop are required'; end if;
  if v_start is null or v_end is null or v_start < (now() at time zone 'Asia/Kolkata')::date then raise exception 'Start date cannot be in the past'; end if;
  if v_end < v_start then raise exception 'End date cannot be before start date'; end if;
  v_days := (v_end - v_start) + 1;
  v_nights := greatest(v_days - 1, 0);
  if v_days > 60 then raise exception 'Trips are limited to 60 days'; end if;

  select array(select distinct (x)::int from jsonb_array_elements_text(coalesce(p->'seats','[]'::jsonb)) x) into v_seats;
  if coalesce(array_length(v_seats,1),0) < 1 or array_length(v_seats,1) > 16 then raise exception 'Select 1 to 16 seats'; end if;
  foreach seat in array v_seats loop
    if seat < 1 or seat > 16 then raise exception 'Invalid seat number'; end if;
  end loop;

  -- Distance = sum of the road legs (one way: A-B, round trip: A-B + B-A, multi-city: A-stops-B).
  if v_trip = 'multi_city' then
    select coalesce(jsonb_agg(left(btrim(x), 250)), '[]'::jsonb) into v_stops from jsonb_array_elements_text(coalesce(p->'stops','[]'::jsonb)) x where btrim(x) <> '';
    if jsonb_array_length(v_stops) not between 1 and 8 then raise exception 'Add 1 to 8 stops for a multi-city trip'; end if;
  end if;
  select coalesce(array_agg(x::numeric), '{}') into v_legs from jsonb_array_elements_text(coalesce(p->'leg_km','[]'::jsonb)) x;
  if coalesce(array_length(v_legs,1),0) <> case v_trip when 'round_trip' then 2 when 'multi_city' then jsonb_array_length(v_stops) + 1 else 1 end then
    raise exception 'Distance is required for every leg'; end if;
  foreach v_leg in array v_legs loop
    if v_leg <= 0 or v_leg > 6000 then raise exception 'Invalid leg distance'; end if;
  end loop;
  select sum(l) into v_dist from unnest(v_legs) l;
  if v_dist <= 0 then raise exception 'Route distance is required'; end if;
  if v_small not between 0 and 16 or v_large not between 0 and 8 or v_over not between 0 and 4 then raise exception 'Invalid luggage count'; end if;

  select array(select distinct x from jsonb_array_elements_text(coalesce(p->'states','[]'::jsonb)) x) into v_states;

  -- Duplicate submission guard (same user, same trip, within 5 minutes)
  select id, booking_reference into v_existing from public.bookings
   where user_id = uid and pickup = v_pickup and dropoff = v_drop and start_date = v_start
     and seat_count = array_length(v_seats,1) and created_at > now() - interval '5 minutes'
   order by created_at desc limit 1;
  if found then return jsonb_build_object('id', v_existing.id, 'booking_reference', v_existing.booking_reference, 'duplicate', true); end if;

  -- One van, one trip at a time: refuse dates that overlap anyone's pending or approved booking.
  -- The lock makes two simultaneous requests for the same dates impossible to both succeed.
  perform pg_advisory_xact_lock(hashtext('urbania_booking_dates'));
  if exists (select 1 from public.bookings where status in ('pending','approved') and start_date <= v_end and end_date >= v_start) then
    raise exception 'Sorry, these dates are no longer available. Please choose different dates.';
  end if;

  select * into cfg from public.fare_configurations where id = 1;
  -- Fare = distance fare + extra state permits + day bata + night bata.
  -- No luggage charge, service charge or GST. Toll is NOT estimated: it is billed at actuals after the trip.
  v_bill := round(v_dist, 1);   -- total road km (round trip already includes the way back)
  v_base := round(v_bill * cfg.per_km_rate, 2);
  select coalesce(sum(public.permit_charge(fee, basis, v_days)),0) into v_permit from public.state_permits where active and state = any(v_states);
  v_dbata := cfg.day_bata_per_day * v_days;
  v_nbata := cfg.night_bata_per_night * v_nights;   -- every night of the trip, driven or halted
  v_total := v_base + v_permit + v_dbata + v_nbata;

  insert into public.customers (user_id, name, phone, email) values (uid, v_name, v_phone, v_email)
  on conflict (user_id) do update set name = excluded.name, phone = excluded.phone, email = coalesce(excluded.email, public.customers.email)
  returning id into v_cust;

  v_ref := 'UPT-' || to_char(now() at time zone 'Asia/Kolkata','YYYYMMDD') || '-' || lpad(nextval('public.booking_seq')::text, 5, '0');

  insert into public.bookings (booking_reference, user_id, customer_id, customer_name, phone, email, pickup, dropoff, start_date, end_date, duration_days,
    special_requests, distance_km, trip_type, billed_km, stops, leg_km, seat_count, small_bags, large_bags, oversized_items,
    base_fare, permit_charge, day_bata, night_bata, driver_bata, total_estimate)
  values (v_ref, uid, v_cust, v_name, v_phone, v_email, v_pickup, v_drop, v_start, v_end, v_days, v_notes, v_dist, v_trip, v_bill, v_stops, to_jsonb(v_legs),
    array_length(v_seats,1), v_small, v_large, v_over, v_base, v_permit, v_dbata, v_nbata, v_dbata + v_nbata, v_total)
  returning id into v_id;

  insert into public.booking_seats select v_id, unnest(v_seats);
  insert into public.booking_luggage values (v_id,'small',v_small),(v_id,'large',v_large),(v_id,'oversized',v_over);
  insert into public.booking_permits select v_id, state, public.permit_charge(fee, basis, v_days) from public.state_permits where active and state = any(v_states);
  insert into public.booking_status_history (booking_id, status, note, changed_by) values (v_id,'pending','Booking submitted',uid);
  insert into public.notifications (user_id, booking_id, phone, title, body)
  values (uid, v_id, v_phone, 'Booking submitted', 'Your booking ' || v_ref || ' is pending admin approval. Estimated fare (excluding toll): Rs ' || v_total);

  return jsonb_build_object('id', v_id, 'booking_reference', v_ref, 'total_estimate', v_total, 'duplicate', false);
end $$;
revoke all on function public.create_booking(jsonb) from public, anon;
grant execute on function public.create_booking(jsonb) to authenticated;

-- ───────────── Admin decision (approve / reject, with optional fare override) ─────────────
create or replace function public.admin_decide_booking(p_id uuid, p_decision text, p_note text, p_override jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings%rowtype; v_final numeric; v_over boolean := false;
  nb numeric; np numeric; nd numeric; nn numeric;
begin
  if not public.is_admin() then raise exception 'Not authorised'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  select * into b from public.bookings where id = p_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status <> 'pending' then raise exception 'Booking already processed'; end if;
  if p_decision = 'rejected' and coalesce(btrim(p_note),'') = '' then raise exception 'A rejection reason is required'; end if;

  v_final := b.total_estimate;
  if p_decision = 'approved' and p_override is not null and p_override <> '{}'::jsonb then
    nb := coalesce((p_override->>'base_fare')::numeric, b.base_fare);
    np := coalesce((p_override->>'permit_charge')::numeric, b.permit_charge);
    nd := coalesce((p_override->>'day_bata')::numeric, b.day_bata);
    nn := coalesce((p_override->>'night_bata')::numeric, b.night_bata);
    if least(nb,np,nd,nn) < 0 then raise exception 'Amounts cannot be negative'; end if;
    v_final := nb+np+nd+nn;
    v_over := true;
    update public.bookings set base_fare=nb, permit_charge=np, day_bata=nd, night_bata=nn, driver_bata=nd+nn where id = p_id;
  end if;

  update public.bookings set status = p_decision, admin_note = nullif(btrim(p_note),''), admin_override = v_over, final_total = v_final,
    decided_by = auth.uid(), decided_at = now() where id = p_id;
  insert into public.booking_status_history (booking_id, status, note, changed_by) values (p_id, p_decision, nullif(btrim(p_note),''), auth.uid());
  insert into public.notifications (user_id, booking_id, phone, title, body, kind) values (
    b.user_id, p_id, b.phone,
    case when p_decision='approved' then 'Booking approved' else 'Booking rejected' end,
    b.booking_reference || case when p_decision='approved' then ' is approved. Fare (excluding toll): Rs ' || v_final else ' was not approved.' end
      || coalesce(' Note: ' || nullif(btrim(p_note),''), ''),
    'decision');
end $$;
revoke all on function public.admin_decide_booking(uuid,text,text,jsonb) from public, anon;
grant execute on function public.admin_decide_booking(uuid,text,text,jsonb) to authenticated;

-- ───────────── Use the Google-verified distance (admin, pending bookings only) ─────────────
create or replace function public.admin_apply_verified_distance(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings%rowtype; cfg public.fare_configurations%rowtype; v_base numeric; v_total numeric;
begin
  if not public.is_admin() then raise exception 'Not authorised'; end if;
  select * into b from public.bookings where id = p_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status <> 'pending' then raise exception 'Only pending bookings can be re-priced'; end if;
  if b.verified_km is null or b.verified_km <= 0 then raise exception 'No verified distance yet'; end if;
  select * into cfg from public.fare_configurations where id = 1;
  v_base := round(b.verified_km * cfg.per_km_rate, 2);
  v_total := v_base + b.permit_charge + b.day_bata + b.night_bata;
  update public.bookings set distance_km = verified_km, billed_km = verified_km, leg_km = verified_leg_km,
    base_fare = v_base, total_estimate = v_total, distance_check = 'verified' where id = p_id;
  insert into public.booking_status_history (booking_id, status, note, changed_by)
  values (p_id, 'pending', 'Distance updated to Google Maps measurement: ' || b.verified_km || ' km', auth.uid());
end $$;
revoke all on function public.admin_apply_verified_distance(uuid) from public, anon;
grant execute on function public.admin_apply_verified_distance(uuid) to authenticated;

-- ───────────── Record actual toll after the trip (from the toll statement) ─────────────
create or replace function public.admin_record_toll(p_id uuid, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings%rowtype; v_final numeric;
begin
  if not public.is_admin() then raise exception 'Not authorised'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 1000000 then raise exception 'Invalid toll amount'; end if;
  select * into b from public.bookings where id = p_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status <> 'approved' then raise exception 'Toll can only be recorded on approved bookings'; end if;
  v_final := b.base_fare + b.permit_charge + b.day_bata + b.night_bata + p_amount;
  update public.bookings set toll_tax = p_amount, toll_recorded_at = now(), final_total = v_final where id = p_id;
  insert into public.booking_status_history (booking_id, status, note, changed_by) values (p_id, 'approved', 'Actual toll recorded: Rs ' || p_amount, auth.uid());
  insert into public.notifications (user_id, booking_id, phone, title, body, kind)
  values (b.user_id, p_id, b.phone, 'Final bill ready', b.booking_reference || ': toll Rs ' || p_amount || ' added as per toll receipts. Final fare: Rs ' || v_final, 'decision');
end $$;
revoke all on function public.admin_record_toll(uuid,numeric) from public, anon;
grant execute on function public.admin_record_toll(uuid,numeric) to authenticated;

-- ───────────── Seed state permits ─────────────
-- Each state sets its own tourist-vehicle tax, by seating capacity and period. The figures below are the
-- ones operators publish for a 16-seater tempo traveller (secondary sources, not government notifications),
-- so every row starts UNVERIFIED. Confirm each rate against the state's current notification or a receipt
-- you have paid, then tick "Verified" in Admin -> Fare Config. Andhra Pradesh / Telangana: no 16-seater rate
-- found, left disabled at 0 until you enter it.
insert into public.state_permits (state, fee, basis, verified, active) values
('Tamil Nadu',  5000,  'per_trip',    false, true),
('Kerala',      9000,  'per_trip',    false, true),
('Goa',         8500,  'per_day',     false, true),
('Maharashtra', 10000, 'per_30_days', false, true),
('Andhra Pradesh', 0,  'per_trip',    false, false),
('Telangana',      0,  'per_trip',    false, false)
on conflict do nothing;

-- ───────────── Realtime ─────────────
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.notifications;

-- ───────────── Create your first admin ─────────────
-- 1) Auth → Users → Add user (email + password).  2) Then run:
-- insert into public.admin_users (user_id, email) select id, email from auth.users where email = 'you@example.com';
