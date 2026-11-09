import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { differenceInCalendarDays, eachDayOfInterval, format, parseISO } from 'date-fns';
import { Check, Copy, Lock, Pencil, Share2 } from 'lucide-react';
import { DateRangePicker } from '../../components/DateRangePicker';
import { Button, Card, CheckRow, Counter, Field, FareCard, PlaceInput, Skeleton, TextArea, cx } from '../../components/ui';
import { StickyCta } from '../../layouts/layouts';
import { useDraft } from '../../contexts/BookingContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useBooking, useFareConfig, useStatePermits, useUnavailableDates } from '../../hooks/useData';
import { api } from '../../services/api';
import type { TripType } from '../../types';
import { PERMIT_BASIS_LABEL, calculateFare, nightsOf, permitCharge, routePoints, sumLegs } from '../../services/fare';
import { routeDistanceKm, routeStates, mapsEnabled } from '../../lib/maps';
import { fmtDate, HOME_STATE, UNION_TERRITORIES, inr, OPERATOR_PHONE, sanitize, tripLabel } from '../../utils/format';

const today = () => format(new Date(), 'yyyy-MM-dd');
const daysOf = (s: string, e: string) => (s && e ? differenceInCalendarDays(parseISO(e), parseISO(s)) + 1 : 0);

const schema = z.object({
  customer_name: z.string().trim().min(2, 'Enter your full name').max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')),
  start_date: z.string().min(1, 'Select a start date').refine((d) => d >= today(), 'Start date cannot be in the past'),
  end_date: z.string().min(1, 'Select an end date'),
  pickup: z.string().trim().min(3, 'Enter pickup location'),
  dropoff: z.string().trim().min(3, 'Enter drop location'),
  special_requests: z.string().max(1000).optional(),
}).refine((v) => !v.end_date || !v.start_date || v.end_date >= v.start_date, { path: ['end_date'], message: 'End date cannot be before start date' });
type FormVals = z.infer<typeof schema>;

// ───────── Step 1 ─────────
export function Step1() {
  const nav = useNavigate();
  const { draft, update } = useDraft();
  const { fullName, phone, user } = useAuth();
  const { register, handleSubmit, watch, setValue, formState: { errors, isValid } } = useForm<FormVals>({
    resolver: zodResolver(schema), mode: 'onChange',
    defaultValues: { ...draft, customer_name: draft.customer_name || fullName, phone: draft.phone || phone },
  });
  const v = watch();
  const setTrip = (k: TripType) => update({ trip_type: k, ...(k === 'multi_city' && draft.stops.length === 0 ? { stops: [''] } : {}), distance_km: 0, leg_km: [] });
  const setStops = (stops: string[]) => update({ stops, leg_km: [], distance_km: 0 });
  const multiOk = draft.trip_type !== 'multi_city' || (draft.stops.length >= 1 && draft.stops.every((x) => x.trim().length >= 3));
  useEffect(() => { register('pickup'); register('dropoff'); register('start_date'); register('end_date'); }, [register]);
  const { data: unavailableList } = useUnavailableDates();
  const unavailable = useMemo(() => new Set(unavailableList ?? []), [unavailableList]);
  // If someone books while this page is open, drop a selection that now overlaps.
  useEffect(() => {
    if (!v.start_date || !unavailable.size) return;
    const last = v.end_date || v.start_date;
    const clash = eachDayOfInterval({ start: parseISO(v.start_date), end: parseISO(last >= v.start_date ? last : v.start_date) }).some((x) => unavailable.has(format(x, 'yyyy-MM-dd')));
    if (clash) { setValue('start_date', '', { shouldValidate: true }); setValue('end_date', '', { shouldValidate: true }); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unavailable]);
  const days = daysOf(v.start_date, v.end_date);

  const onSubmit = (d: FormVals) => {
    const routeChanged = d.pickup !== draft.pickup || d.dropoff !== draft.dropoff;
    update({ ...d, email: d.email ?? '', special_requests: sanitize(d.special_requests ?? ''), customer_name: sanitize(d.customer_name), distance_km: routeChanged ? 0 : draft.distance_km, ...(routeChanged ? { leg_km: [] } : {}) });
    nav('/booking/step-2');
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="px-4 py-4 space-y-4 pb-32">
      <Field label="Full name" {...register('customer_name')} error={errors.customer_name?.message} autoComplete="name" />
      <Field label="Phone number" inputMode="numeric" maxLength={10} {...register('phone')} error={errors.phone?.message} hint={user?.is_anonymous ? 'Used to track your booking' : undefined} />
      <Field label="Email (optional)" type="email" {...register('email')} error={errors.email?.message} />
      <div className="space-y-2">
        <p className="text-sm font-medium">Trip dates <span className="text-muted font-normal">(tap the first and last day)</span></p>
        <DateRangePicker start={v.start_date ?? ''} end={v.end_date ?? ''} unavailable={unavailable}
          onChange={(s, e) => { setValue('start_date', s, { shouldValidate: true }); setValue('end_date', e, { shouldValidate: true }); }}
          error={errors.start_date?.message || errors.end_date?.message} />
        {unavailable.size > 0 && <p className="text-xs text-muted">Crossed-out days are not available.</p>}
      </div>
      {days > 0 && <p className="text-sm font-medium text-navy bg-amber/15 rounded-xl px-3 py-2">Trip duration: {days} {days === 1 ? 'Day' : 'Days'}</p>}
      <div role="radiogroup" aria-label="Trip type" className="grid grid-cols-3 gap-2">
        {([['one_way', 'One way'], ['round_trip', 'Round trip'], ['multi_city', 'Multi-city']] as const).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={draft.trip_type === k} onClick={() => setTrip(k)}
            className={cx('min-h-[48px] rounded-xl border-2 font-medium', draft.trip_type === k ? 'bg-navy text-white border-navy' : 'bg-white border-gray-200')}>{l}</button>
        ))}
      </div>
      <p className="text-xs text-muted -mt-2">{draft.trip_type === 'round_trip' ? 'The return distance is added to the total.' : draft.trip_type === 'multi_city' ? 'Visit several cities in order. Each leg is priced by distance.' : 'Distance is counted from pickup to drop only.'}</p>
      <PlaceInput label="Pickup location" value={v.pickup ?? ''} onChange={(x) => setValue('pickup', x, { shouldValidate: true })} error={errors.pickup?.message} />
      {draft.trip_type === 'multi_city' && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-navy">Stops, in order</p>
          {draft.stops.map((st, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1"><PlaceInput label={`Stop ${i + 1}`} value={st} onChange={(x) => setStops(draft.stops.map((o, k) => (k === i ? x : o)))} /></div>
              <Button type="button" variant="ghost" aria-label={`Remove stop ${i + 1}`} onClick={() => setStops(draft.stops.length > 1 ? draft.stops.filter((_, k) => k !== i) : [''])}>Remove</Button>
            </div>
          ))}
          <Button type="button" variant="navy" className="min-h-[44px]" disabled={draft.stops.length >= 8} onClick={() => setStops([...draft.stops, ''])}>+ Add stop</Button>
        </div>
      )}
      <PlaceInput label={draft.trip_type === 'multi_city' ? 'Final drop location' : 'Drop location'} value={v.dropoff ?? ''} onChange={(x) => setValue('dropoff', x, { shouldValidate: true })} error={errors.dropoff?.message} />
      <TextArea label="Special requests / notes (optional)" {...register('special_requests')} />
      <StickyCta><Button full type="submit" disabled={!isValid || !multiOk}>Next: Configure Trip</Button></StickyCta>
    </form>
  );
}

function useGuard() {
  const { draft } = useDraft();
  return !!(draft.customer_name && draft.start_date && draft.pickup && draft.dropoff);
}

// ───────── Step 2 ─────────
export function Step2() {
  const nav = useNavigate();
  const { draft, update } = useDraft();
  const ok = useGuard();
  const { data: cfg } = useFareConfig();
  if (!ok) return <Navigate to="/booking/step-1" replace />;
  const toggle = (n: number) => update({ seats: draft.seats.includes(n) ? draft.seats.filter((s) => s !== n) : [...draft.seats, n].sort((a, b) => a - b) });
  return (
    <div className="px-4 py-4 space-y-4 pb-48">
      <Card>
        <div className="flex justify-between items-center mb-3">
          <p className="font-medium">Select seats</p>
          <span className="text-sm font-semibold text-navy">Selected: {draft.seats.length} / 16 Seats</span>
        </div>
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="Seats">
          {Array.from({ length: 16 }, (_, i) => i + 1).map((n) => {
            const on = draft.seats.includes(n);
            return (
              <button key={n} type="button" aria-pressed={on} onClick={() => toggle(n)}
                className={cx('h-14 rounded-xl font-semibold border-2 transition', on ? 'bg-amber border-amber text-navy' : 'bg-white border-gray-200 text-ink')}>{n}</button>
            );
          })}
        </div>
        <div className="flex gap-2 mt-3">
          <button type="button" className="text-sm text-navy underline" onClick={() => update({ seats: Array.from({ length: 16 }, (_, i) => i + 1) })}>Select all</button>
          <button type="button" className="text-sm text-muted underline" onClick={() => update({ seats: [] })}>Clear</button>
        </div>
        {draft.seats.length === 0 && <p className="text-xs text-muted mt-2">Minimum 1 seat required</p>}
        <p className="text-xs text-muted mt-2">Seats help us plan your group size. Your fare is based on distance.</p>
      </Card>
      <Card>
        <p className="font-medium mb-1">Luggage <span className="text-xs font-normal text-muted">(for planning, no extra charge)</span></p>
        <Counter label="Small Bags" value={draft.small_bags} max={16} onChange={(n) => update({ small_bags: n })} />
        <Counter label="Large Bags" value={draft.large_bags} max={8} onChange={(n) => update({ large_bags: n })} />
        <Counter label="Oversized Items" hint="Subject to space availability" value={draft.oversized_items} max={4} onChange={(n) => update({ oversized_items: n })} />
      </Card>
      <StickyCta>
        <div className="bg-navy text-white rounded-xl px-4 py-2 flex justify-between text-sm mb-2"><span>Group size</span><span className="font-semibold">{draft.seats.length} {draft.seats.length === 1 ? 'seat' : 'seats'}</span></div>
        <Button full disabled={draft.seats.length < 1} onClick={() => nav('/booking/step-3')}>Next: Permits & Charges</Button>
      </StickyCta>
    </div>
  );
}

// ───────── Step 3 ─────────
export function Step3() {
  const nav = useNavigate();
  const { draft, update } = useDraft();
  const ok = useGuard();
  const { data: cfg } = useFareConfig();
  const { data: permits } = useStatePermits();
  const [routeState, setRouteState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [statesState, setStatesState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [retry, setRetry] = useState(0);
  const days = daysOf(draft.start_date, draft.end_date);

  // The route is a list of legs: one way = A→B, round trip = A→B + B→A, multi-city = A→stops→B.
  // Distance is worked out first (each leg looked up by road), then priced at the per-km rate.
  const pts = routePoints(draft);
  const sig = pts.join('|') + draft.trip_type;
  useEffect(() => {
    if (!ok) return;
    if (draft.route_sig !== sig) { update({ route_sig: sig, leg_km: [], distance_km: 0, states: [], states_sig: '', route_states: [] }); return; }
    if (!mapsEnabled) return;
    const need = pts.slice(1).map((_, i) => i).filter((i) => !(draft.leg_km[i] > 0));
    if (!need.length) return;
    setRouteState('loading');
    Promise.all(need.map((i) => routeDistanceKm(pts[i], pts[i + 1]).then((km) => [i, km] as const)))
      .then((res) => {
        const legs = pts.slice(1).map((_, i) => draft.leg_km[i] || 0);
        res.forEach(([i, km]) => { legs[i] = km; });
        update({ leg_km: legs, distance_km: sumLegs(legs) });
        setRouteState('idle');
      })
      .catch(() => setRouteState('error'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, sig, draft.route_sig, retry]);

  // The states the route passes through are detected from the road route, never picked by the customer.
  useEffect(() => {
    if (!ok || !mapsEnabled || !permits || draft.route_sig !== sig || draft.states_sig === sig) return;
    setStatesState('loading');
    routeStates(pts)
      .then((found) => {
        const taxed = permits.filter((p) => p.active && found.includes(p.state)).map((p) => p.state);
        update({ route_states: found, states: taxed, states_sig: sig });
        setStatesState('idle');
      })
      .catch(() => setStatesState('error'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, sig, draft.route_sig, draft.states_sig, permits, retry]);

  const fare = useMemo(() => (cfg && permits ? calculateFare(cfg, permits, draft, days) : null), [cfg, permits, draft, days]);
  if (!ok || draft.seats.length < 1) return <Navigate to="/booking/step-1" replace />;
  if (!cfg || !permits || !fare) return <div className="p-4 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>;
  const detecting = routeState === 'loading' || statesState === 'loading';
  const failed = !mapsEnabled || routeState === 'error' || statesState === 'error';
  const ready = !failed && !detecting && draft.distance_km > 0 && draft.states_sig === sig;
  const stateRows = permits.filter((p) => p.active && draft.states.includes(p.state));
  const otherStates = draft.route_states.filter((n) => n !== HOME_STATE && !UNION_TERRITORIES.includes(n) && !permits.some((p) => p.active && p.state === n));

  return (
    <div className="px-4 py-4 space-y-4 pb-48">
      <Card className="space-y-3">
        <CheckRow><Lock size={14} /> All India Permit Included</CheckRow>
        <p className="font-medium">State permit tax on your route</p>
        {detecting && <Skeleton className="h-10" />}
        {failed && (
          <div className="text-sm space-y-2">
            <p className="text-danger">{mapsEnabled ? 'We could not measure your route right now.' : 'Automatic route pricing is not available right now.'}</p>
            {mapsEnabled && <Button variant="navy" onClick={() => { setRouteState('idle'); setStatesState('idle'); update({ route_sig: '' }); setRetry((n) => n + 1); }}>Try again</Button>}
            <a href={`tel:${OPERATOR_PHONE}`} className="block text-navy underline">Call us to book</a>
          </div>
        )}
        {ready && (stateRows.length ? (
          <div className="space-y-1.5">
            {stateRows.map((p) => (
              <div key={p.state} className="flex justify-between text-sm"><span className="flex items-center gap-1.5"><Check size={14} className="text-success" />{p.state} <span className="text-muted">({inr(p.fee)} {PERMIT_BASIS_LABEL[p.basis]})</span></span><b>{inr(permitCharge(p, days))}</b></div>
            ))}
          </div>
        ) : <p className="text-sm text-muted">Your route does not enter any state that charges an additional permit tax.</p>)}
        {ready && otherStates.length > 0 && <p className="text-xs text-muted">Your route also passes through {otherStates.join(', ')}. Any tax there will be confirmed by our team before approval.</p>}
        <p className="text-xs text-muted">Detected automatically from your driving route.</p>
      </Card>
      <Card className="space-y-2">
        <p className="font-medium">Trip distance</p>
        {routeState === 'loading' && <Skeleton className="h-10" />}
        {pts.slice(1).map((place, i) => (
          <Field key={i} label={`${pts[i]} → ${place} (km)`} value={draft.leg_km[i] ? `${draft.leg_km[i]} km` : ''} readOnly placeholder={detecting ? 'Measuring…' : '—'} />
        ))}
        <p className="text-xs text-muted">Measured automatically along the driving route with Google Maps. We re-check it after you book.</p>
        <div className="border-t pt-2 flex justify-between items-baseline"><span className="text-sm">Total distance</span><b className="font-heading text-lg text-navy">{draft.distance_km > 0 ? `${draft.distance_km} km` : '—'}</b></div>
      </Card>
      <Card>
        <p className="font-medium">Distance Fare</p>
        {draft.distance_km > 0
          ? <p className="text-sm text-muted mt-1">{draft.distance_km} km × {inr(cfg.per_km_rate)}/km = <b className="text-ink">{inr(fare.baseFare)}</b></p>
          : routeState !== 'loading' && <p className="text-xs text-danger mt-1">Enter the route distance to continue.</p>}
      </Card>
      <Card>
        <p className="font-medium">Driver Bata</p>
        <p className="text-sm text-muted mt-1">Day bata: {inr(cfg.day_bata_per_day)} × {days} {days === 1 ? 'day' : 'days'} = <b className="text-ink">{inr(fare.dayBata)}</b></p>
        <p className="text-sm text-muted">Night bata: {inr(cfg.night_bata_per_night)} × {nightsOf(days)} {nightsOf(days) === 1 ? 'night' : 'nights'} = <b className="text-ink">{inr(fare.nightBata)}</b></p>
        <p className="text-xs text-muted mt-1">Night bata applies to every night of the trip, whether the vehicle is driven or halted overnight.</p>
      </Card>
      <Card>
        <p className="font-medium">Toll Tax</p>
        <p className="text-sm text-muted mt-1">Not included in the estimate. Toll is charged as per the actual toll statement and added to your final bill after the trip.</p>
      </Card>
      <StickyCta>
        <div className="bg-navy text-white rounded-xl px-4 py-2 flex justify-between mb-2"><span className="text-sm">Estimated Fare (excl. toll)</span><span className="font-heading font-bold">{inr(fare.total)}</span></div>
        <Button full disabled={!ready || pts.slice(1).some((_, i) => !(draft.leg_km[i] > 0))} onClick={() => nav('/booking/step-4')}>Next: Review & Confirm</Button>
      </StickyCta>
    </div>
  );
}

// ───────── Step 4 ─────────
export function Step4() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const { draft, reset } = useDraft();
  const ok = useGuard();
  const { data: cfg } = useFareConfig();
  const { data: permits } = useStatePermits();
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const days = daysOf(draft.start_date, draft.end_date);
  const fare = useMemo(() => (cfg && permits ? calculateFare(cfg, permits, draft, days) : null), [cfg, permits, draft, days]);
  if (!ok || draft.seats.length < 1) return <Navigate to="/booking/step-1" replace />;
  if (!cfg || !permits || !fare) return <div className="p-4 space-y-3"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  const chosen = permits.filter((p) => draft.states.includes(p.state)).map((p) => ({ state: p.state, fee: permitCharge(p, days) }));

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.createBooking(draft);
      reset();
      nav('/booking/confirmation', { replace: true, state: { id: r.id } });
    } catch (e) {
      if (/no longer available/i.test((e as Error).message)) qc.invalidateQueries({ queryKey: ['unavailable-dates'] });
      toast(navigator.onLine ? (e as Error).message : 'You appear to be offline. Please check your connection and try again.', 'error');
      setBusy(false);
    }
  };

  const Row = ({ l, v }: { l: string; v: string }) => <div className="flex justify-between gap-4 py-1 text-sm"><span className="text-muted">{l}</span><span className="text-right font-medium">{v}</span></div>;
  return (
    <div className="px-4 py-4 space-y-4 pb-52">
      <Card>
        <div className="flex justify-between items-center mb-1"><p className="font-heading font-semibold text-navy">Customer</p><Link to="/booking/step-1" aria-label="Edit"><Pencil size={16} /></Link></div>
        <Row l="Name" v={draft.customer_name} /><Row l="Phone" v={'+91 ' + draft.phone} />{draft.email && <Row l="Email" v={draft.email} />}
      </Card>
      <Card>
        <p className="font-heading font-semibold text-navy mb-1">Trip</p>
        <Row l="Pickup" v={draft.pickup} /><Row l="Drop" v={draft.dropoff} /><Row l="Start" v={fmtDate(draft.start_date)} /><Row l="End" v={fmtDate(draft.end_date)} />
        <Row l="Trip type" v={tripLabel(draft.trip_type)} />{draft.trip_type === 'multi_city' && <Row l="Via" v={draft.stops.join(' → ')} />}<Row l="Duration" v={`${days} ${days === 1 ? 'day' : 'days'}`} />{draft.special_requests && <Row l="Notes" v={draft.special_requests} />}
      </Card>
      <Card>
        <p className="font-heading font-semibold text-navy mb-1">Vehicle</p>
        <Row l="Seats" v={`${draft.seats.length} (${draft.seats.join(', ')})`} />
        <Row l="Small / Large / Oversized" v={`${draft.small_bags} / ${draft.large_bags} / ${draft.oversized_items}`} />
      </Card>
      <FareCard fare={fare} permits={chosen} days={days} nights={nightsOf(days)} dayRate={cfg.day_bata_per_day} nightRate={cfg.night_bata_per_night} distanceKm={draft.distance_km} kmRate={cfg.per_km_rate} tripType={draft.trip_type} />
      <label className="flex items-start gap-3 text-sm min-h-[48px]">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="w-6 h-6 mt-0.5 accent-[#1A2E4A]" />
        <span>I agree to the <Link to="/terms" className="text-navy underline" target="_blank">Terms & Conditions</Link></span>
      </label>
      <StickyCta><Button full disabled={!agree} loading={busy} onClick={submit}>Submit Booking Request</Button></StickyCta>
    </div>
  );
}

// ───────── Confirmation ─────────
export function Confirmation() {
  const { state } = useLocation() as { state: { id?: string } | null };
  const toast = useToast();
  const { data: b } = useBooking(state?.id);
  if (!state?.id) return <Navigate to="/home" replace />;
  if (!b) return <div className="p-6"><Skeleton className="h-64" /></div>;
  const copy = async () => { await navigator.clipboard?.writeText(b.booking_reference); toast('Reference copied', 'success'); };
  const text = `Urbania Premium Travels booking ${b.booking_reference}\n${b.pickup} → ${b.dropoff}\n${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}\nEstimated fare: ${inr(b.total_estimate)} (pending admin approval)`;
  const share = async () => { if (navigator.share) { try { await navigator.share({ title: 'Booking details', text }); } catch { /* cancelled */ } } else { await navigator.clipboard?.writeText(text); toast('Details copied', 'success'); } };
  return (
    <div className="px-6 py-10 text-center space-y-4">
      <div className="w-24 h-24 rounded-full bg-success mx-auto grid place-items-center text-white animate-pop"><Check size={52} strokeWidth={3} /></div>
      <h1 className="font-heading font-bold text-2xl text-navy">Booking Request Submitted!</h1>
      <button onClick={copy} className="font-mono font-bold text-xl text-navy inline-flex items-center gap-2 min-h-[48px]" aria-label="Copy booking reference">{b.booking_reference}<Copy size={16} /></button>
      <Card className="text-left text-sm space-y-1">
        <p><b>{b.pickup}</b> → <b>{b.dropoff}</b></p>
        <p className="text-muted">{fmtDate(b.start_date)} – {fmtDate(b.end_date)}</p>
        <p>Estimated total: <b>{inr(b.total_estimate)}</b></p>
      </Card>
      <span className="inline-block bg-pending/15 text-pending font-semibold px-3 py-1.5 rounded-full text-sm">⏳ Pending Admin Approval</span>
      <p className="text-sm text-muted">You will receive an SMS once your booking is approved or rejected.</p>
      <Link to={`/bookings/${b.id}`}><Button full>Track My Booking</Button></Link>
      <Button full variant="ghost" onClick={share}><Share2 size={16} /> Share Booking Details</Button>
      <Link to="/home" className="block text-muted text-sm py-2">Back to Home</Link>
    </div>
  );
}
