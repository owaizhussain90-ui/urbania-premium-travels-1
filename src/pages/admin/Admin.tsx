import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, Phone, Plus, Trash2 } from 'lucide-react';
import { Button, Card, Field, ListSkeleton, Modal, Skeleton, StatusBadge, TextArea, cx } from '../../components/ui';
import { useToast } from '../../contexts/ToastContext';
import { useBooking, useFareConfig, useStatePermits } from '../../hooks/useData';
import { api } from '../../services/api';
import { downloadCsv, fmtDate, fmtDateTime, inr, tripLabel, UNION_TERRITORIES } from '../../utils/format';
import { PERMIT_BASIS_LABEL } from '../../services/fare';
import type { BookingStatus, FareConfig as FC, StatePermit } from '../../types';

// ───────── Dashboard ─────────
export function Dashboard() {
  const nav = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['admin-bookings'], queryFn: api.adminBookings });
  const [tab, setTab] = useState<'all' | BookingStatus>('all');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((b) =>
      (tab === 'all' || b.status === tab) &&
      (!s || [b.customer_name, b.phone, b.booking_reference].some((x) => x.toLowerCase().includes(s))) &&
      (!from || b.start_date >= from) && (!to || b.start_date <= to));
  }, [data, tab, q, from, to]);

  const count = (s?: BookingStatus) => (data ?? []).filter((b) => !s || b.status === s).length;
  const stats = [['Total Bookings', count(), 'text-navy'], ['Pending', count('pending'), 'text-pending'], ['Approved', count('approved'), 'text-success'], ['Rejected', count('rejected'), 'text-danger']] as const;

  const exportCsv = () => downloadCsv(`urbania-bookings-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Booking ID', 'Customer Name', 'Phone', 'Pickup', 'Drop', 'Start Date', 'End Date', 'Seats', 'Luggage (S/L/XL)', 'Estimated Fare', 'Final Fare', 'Status', 'Admin Note', 'Created At'],
    ...rows.map((b) => [b.booking_reference, b.customer_name, b.phone, b.pickup, b.dropoff, b.start_date, b.end_date, b.seat_count, `${b.small_bags}/${b.large_bags}/${b.oversized_items}`, b.total_estimate, b.final_total ?? '', b.status, b.admin_note ?? '', b.created_at]),
  ]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(([l, n, c]) => <Card key={l}><p className="text-xs text-muted">{l}</p><p className={cx('font-heading font-bold text-3xl', c)}>{n}</p></Card>)}
      </div>
      <Card className="space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <Field className="flex-1 min-w-[200px]" label="Search" placeholder="Name, phone or booking ID" value={q} onChange={(e) => setQ(e.target.value)} />
          <Field label="Trip from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Field label="Trip to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button variant="navy" onClick={exportCsv} disabled={!rows.length}><Download size={16} /> Export CSV</Button>
        </div>
        <div className="flex gap-2 overflow-x-auto" role="tablist">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx('px-4 min-h-[40px] rounded-full text-sm capitalize', tab === t ? 'bg-navy text-white' : 'bg-surface border border-gray-200')}>{t}</button>
          ))}
        </div>
      </Card>
      {isLoading ? <ListSkeleton /> : (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="text-left text-xs text-muted bg-surface"><tr>{['Booking ID', 'Customer', 'Phone', 'Route', 'Dates', 'Fare', 'Status'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-t border-gray-100 hover:bg-surface cursor-pointer" onClick={() => nav(`/admin/booking/${b.id}`)}>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-navy"><Link to={`/admin/booking/${b.id}`} onClick={(e) => e.stopPropagation()}>{b.booking_reference}</Link></td>
                  <td className="px-4 py-3">{b.customer_name}</td><td className="px-4 py-3">{b.phone}</td>
                  <td className="px-4 py-3 max-w-[220px] truncate">{b.pickup} → {b.dropoff}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDate(b.start_date)} – {fmtDate(b.end_date)}</td>
                  <td className="px-4 py-3 font-medium">{inr(b.final_total ?? b.total_estimate)}</td><td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="text-center text-muted py-10">No bookings match your filters</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ───────── Booking detail with approve / reject / override ─────────
const OVERRIDE_FIELDS = [['base_fare', 'Distance fare'], ['permit_charge', 'State permits'], ['day_bata', 'Day bata'], ['night_bata', 'Night bata']] as const;

export function AdminBooking() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: b, isLoading } = useBooking(id);
  const [note, setNote] = useState('');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<null | 'approved' | 'rejected'>(null);
  const [busy, setBusy] = useState(false);
  const [tollVal, setTollVal] = useState<string | undefined>(undefined);

  if (isLoading || !b) return <Skeleton className="h-96" />;
  const pending = b.status === 'pending';
  const cur = (k: (typeof OVERRIDE_FIELDS)[number][0]) => (vals[k] !== undefined ? Number(vals[k]) || 0 : Number(b[k]));
  const total = OVERRIDE_FIELDS.reduce((s, [k]) => s + cur(k), 0);
  const changed = OVERRIDE_FIELDS.some(([k]) => vals[k] !== undefined && Number(vals[k]) !== Number(b[k]));

  const act = async () => {
    if (!confirm) return;
    if (confirm === 'rejected' && !note.trim()) { setConfirm(null); return toast('Add a rejection reason for the customer', 'error'); }
    setBusy(true);
    try {
      const override = confirm === 'approved' && changed ? Object.fromEntries(OVERRIDE_FIELDS.map(([k]) => [k, cur(k)])) : null;
      await api.decide(b.id, confirm, note, override);
      toast(confirm === 'approved' ? 'Booking approved' : 'Booking rejected', 'success');
      qc.invalidateQueries({ queryKey: ['booking', b.id] }); qc.invalidateQueries({ queryKey: ['admin-bookings'] });
      setConfirm(null);
    } catch (e) { toast((e as Error).message, 'error'); }
    setBusy(false);
  };
  const useGoogleKm = async () => {
    setBusy(true);
    try {
      await api.applyVerifiedDistance(b.id);
      toast('Fare updated to the Google Maps distance', 'success');
      qc.invalidateQueries({ queryKey: ['booking', b.id] }); qc.invalidateQueries({ queryKey: ['admin-bookings'] });
    } catch (e) { toast((e as Error).message, 'error'); }
    setBusy(false);
  };
  const saveToll = async () => {
    setBusy(true);
    try {
      await api.recordToll(b.id, Number(tollVal));
      toast('Final bill updated. Customer notified.', 'success');
      setTollVal(undefined);
      qc.invalidateQueries({ queryKey: ['booking', b.id] }); qc.invalidateQueries({ queryKey: ['admin-bookings'] });
    } catch (e) { toast((e as Error).message, 'error'); }
    setBusy(false);
  };
  const Row = ({ l, v }: { l: string; v: string }) => <div className="flex justify-between gap-4 py-1 text-sm"><span className="text-muted">{l}</span><span className="text-right font-medium">{v}</span></div>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3"><button onClick={() => nav('/admin/dashboard')} aria-label="Back" className="p-2 -ml-2"><ArrowLeft /></button>
        <h1 className="font-mono font-bold text-navy text-lg">{b.booking_reference}</h1><StatusBadge status={b.status} /></div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <p className="font-heading font-semibold text-navy mb-1">Customer</p>
          <Row l="Name" v={b.customer_name} /><div className="flex justify-between py-1 text-sm"><span className="text-muted">Phone</span><a href={`tel:${b.phone}`} className="font-medium text-navy flex items-center gap-1"><Phone size={14} />{b.phone}</a></div>
          {b.email && <Row l="Email" v={b.email} />}<Row l="Submitted" v={fmtDateTime(b.created_at)} />
        </Card>
        <Card>
          <p className="font-heading font-semibold text-navy mb-1">Trip</p>
          <Row l="Pickup" v={b.pickup} /><Row l="Drop" v={b.dropoff} /><Row l="Dates" v={`${fmtDate(b.start_date)} – ${fmtDate(b.end_date)} (${b.duration_days}d)`} />
          <Row l="Trip type" v={tripLabel(b.trip_type)} />{b.stops?.length > 0 && <Row l="Via" v={b.stops.join(' → ')} />}{b.leg_km?.length > 0 && <Row l="Legs" v={b.leg_km.join(' + ') + ' km'} />}<Row l="Distance" v={`${b.distance_km} km (${b.billed_km} km billed)`} /><Row l="Seats" v={`${b.seat_count}: ${b.booking_seats.map((s) => s.seat_no).sort((x, y) => x - y).join(', ')}`} />
          <Row l="Luggage (S/L/XL)" v={`${b.small_bags} / ${b.large_bags} / ${b.oversized_items}`} />
          {b.booking_permits.length > 0 && <Row l="Permits" v={b.booking_permits.map((p) => p.state).join(', ')} />}
          {b.special_requests && <Row l="Notes" v={b.special_requests} />}
        </Card>
      </div>
      <Card className={b.distance_check === 'mismatch' ? 'border-2 border-pending' : ''}>
        <p className="font-heading font-semibold text-navy mb-1">Distance check (Google Maps)</p>
        {b.distance_check === 'pending' && <p className="text-sm text-muted">Verifying the route in the background…</p>}
        {b.distance_check === 'unavailable' && <p className="text-sm text-muted">Google Maps could not verify this route automatically. Please check the distance manually.</p>}
        {b.distance_check === 'verified' && <p className="text-sm text-success font-medium">Verified: {b.verified_km ?? b.billed_km} km{b.verified_leg_km?.length ? ` (${b.verified_leg_km.join(' + ')})` : ''} matches the billed {b.billed_km} km.</p>}
        {b.verified_states && (() => {
          const billed = b.booking_permits.map((p) => p.state);
          const missing = b.verified_states.filter((n) => n !== 'Karnataka' && !UNION_TERRITORIES.includes(n) && !billed.includes(n));
          return <p className={`text-sm mt-2 ${missing.length ? 'text-danger' : 'text-muted'}`}>Route passes through: {b.verified_states.join(', ')}.{missing.length ? ` Not charged on this booking: ${missing.join(', ')}. Check the state permit tax before approving.` : ''}</p>;
        })()}
        {b.distance_check === 'mismatch' && (
          <>
            <p className="text-sm">Billed <b>{b.billed_km} km</b>, but Google Maps measures <b>{b.verified_km} km</b>{b.verified_leg_km?.length ? ` (${b.verified_leg_km.join(' + ')})` : ''}.</p>
            {pending && <Button className="mt-3" variant="navy" loading={busy} onClick={useGoogleKm}>Use Google distance and re-price</Button>}
          </>
        )}
      </Card>
      <Card>
        <p className="font-heading font-semibold text-navy mb-2">Fare {pending && <span className="text-xs font-normal text-muted">(editable before approval)</span>}</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {OVERRIDE_FIELDS.map(([k, label]) => pending
            ? <Field key={k} label={label} type="number" min={0} value={vals[k] ?? String(b[k])} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
            : <Row key={k} l={label} v={inr(b[k])} />)}
        </div>
        {!pending && b.toll_recorded_at && <div className="mt-2"><Row l="Toll tax (actual)" v={inr(b.toll_tax)} /></div>}
        <div className="flex justify-between border-t mt-3 pt-3 items-baseline"><span className="font-semibold">{pending ? 'Total' : 'Final total'}</span>
          <span className="font-heading font-bold text-2xl text-navy">{inr(pending ? total : b.final_total ?? b.total_estimate)}</span></div>
        {pending && changed && <p className="text-xs text-pending mt-1">Original estimate was {inr(b.total_estimate)}. This override will be applied on approval.</p>}
        {!pending && b.admin_override && <p className="text-xs text-muted mt-1">Original estimate: {inr(b.total_estimate)}</p>}
      </Card>
      {b.status === 'approved' && (
        <Card className="space-y-3">
          <p className="font-heading font-semibold text-navy">Toll tax (after trip)</p>
          <p className="text-sm text-muted">{b.toll_recorded_at ? `Recorded ${fmtDateTime(b.toll_recorded_at)}. You can update it.` : 'Enter the actual toll from the toll statement once the trip is over. The customer is notified of the final bill.'}</p>
          <Field label="Actual toll amount (₹)" type="number" min={0} value={tollVal ?? (b.toll_recorded_at ? String(b.toll_tax) : '')} onChange={(e) => setTollVal(e.target.value)} />
          <Button loading={busy} disabled={tollVal === undefined || tollVal === ''} onClick={saveToll}>{b.toll_recorded_at ? 'Update toll amount' : 'Record toll & send final bill'}</Button>
        </Card>
      )}
      {pending ? (
        <Card className="space-y-3">
          <TextArea label="Message to Customer (required for rejection)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          <div className="flex gap-3">
            <Button variant="success" className="flex-1" onClick={() => setConfirm('approved')}>Approve Booking</Button>
            <Button variant="outline" className="flex-1" onClick={() => setConfirm('rejected')}>Reject Booking</Button>
          </div>
        </Card>
      ) : b.admin_note && <Card><p className="text-xs text-muted">Message sent to customer</p><p className="text-sm mt-1">{b.admin_note}</p></Card>}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm === 'approved' ? 'Confirm Approval' : 'Confirm Rejection'}>
        <p className="text-sm mb-4">{confirm === 'approved' ? 'Approve' : 'Reject'} booking <b className="font-mono">{b.booking_reference}</b> for <b>{b.customer_name}</b>? The customer will be notified.</p>
        <div className="flex gap-3"><Button variant="ghost" className="flex-1" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant={confirm === 'approved' ? 'success' : 'danger'} className="flex-1" loading={busy} onClick={act}>Confirm</Button></div>
      </Modal>
    </div>
  );
}

// ───────── Fare configuration ─────────
const CFG_FIELDS: [keyof FC, string][] = [
  ['per_km_rate', 'Distance fare per km (₹)'], ['day_bata_per_day', 'Day bata per day (₹)'], ['night_bata_per_night', 'Night bata per night (₹)'],
];

export function FareConfig() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: cfg } = useFareConfig();
  const { data: permits } = useStatePermits();
  const [vals, setVals] = useState<Partial<Record<keyof FC, string>>>({});
  const [newState, setNewState] = useState('');
  const [newFee, setNewFee] = useState('');
  if (!cfg || !permits) return <Skeleton className="h-96" />;

  const save = async () => {
    const patch = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Number(v)])) as Partial<FC>;
    if (Object.values(patch).some((n) => !Number.isFinite(n) || (n as number) < 0)) return toast('Enter valid non-negative numbers', 'error');
    try { await api.updateFareConfig(patch); setVals({}); qc.invalidateQueries({ queryKey: ['fare-config'] }); toast('Fare configuration saved. Applies to new bookings.', 'success'); }
    catch (e) { toast((e as Error).message, 'error'); }
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ['state-permits'] });
  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="font-heading font-bold text-xl text-navy">Fare Configuration</h1>
      <Card>
        <div className="grid sm:grid-cols-2 gap-3">
          {CFG_FIELDS.map(([k, l]) => <Field key={k} label={l} type="number" min={0} step="0.01" value={vals[k] ?? String(cfg[k])} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />)}
        </div>
        <Button className="mt-4" disabled={!Object.keys(vals).length} onClick={save}>Save changes</Button>
      </Card>
      <Card>
        <p className="font-heading font-semibold text-navy">State tourist-vehicle tax</p>
        <p className="text-xs text-muted mb-3">Each state sets its own rate and basis. Tick Verified only after confirming the rate against the state's current notification or a receipt you paid. Charged on the booking as: per trip = once; per day = fee × trip days; per 7 / 30 days = fee × periods.</p>
        <div className="space-y-2">
          {permits.map((p) => (
            <div key={p.state} className="flex items-center gap-2">
              <span className={cx('flex-1 text-sm', !p.active && 'text-muted line-through')}>{p.state}</span>
              <select aria-label={`${p.state} basis`} defaultValue={p.basis} className="min-h-[44px] px-2 rounded-xl border border-gray-200 text-sm"
                onChange={async (e) => { await api.upsertPermit({ ...p, basis: e.target.value as StatePermit['basis'] }); refresh(); toast(`${p.state} updated`, 'success'); }}>
                {(Object.keys(PERMIT_BASIS_LABEL) as StatePermit['basis'][]).map((k) => <option key={k} value={k}>{PERMIT_BASIS_LABEL[k]}</option>)}
              </select>
              <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" defaultChecked={p.verified} onChange={async (e) => { await api.upsertPermit({ ...p, verified: e.target.checked }); refresh(); }} />Verified</label>
              <input aria-label={`${p.state} fee`} type="number" min={0} defaultValue={p.fee} className="w-28 min-h-[44px] px-3 rounded-xl border border-gray-200"
                onBlur={async (e) => { const fee = Number(e.target.value); if (fee !== Number(p.fee) && fee >= 0) { await api.upsertPermit({ ...p, fee }); refresh(); toast(`${p.state} updated`, 'success'); } }} />
              <button className="text-xs text-navy underline w-14" onClick={async () => { await api.upsertPermit({ ...p, active: !p.active }); refresh(); }}>{p.active ? 'Disable' : 'Enable'}</button>
              <button aria-label={`Delete ${p.state}`} className="p-2 text-danger" onClick={async () => { await api.deletePermit(p.state); refresh(); }}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-4 items-end">
          <Field className="flex-1" label="Add state" value={newState} onChange={(e) => setNewState(e.target.value)} />
          <Field className="w-28" label="Fee (₹)" type="number" min={0} value={newFee} onChange={(e) => setNewFee(e.target.value)} />
          <Button variant="navy" disabled={!newState.trim()} onClick={async () => { await api.upsertPermit({ state: newState.trim(), fee: Number(newFee) || 0, basis: 'per_trip', verified: false, active: true }); setNewState(''); setNewFee(''); refresh(); }}><Plus size={16} /></Button>
        </div>
      </Card>
    </div>
  );
}
