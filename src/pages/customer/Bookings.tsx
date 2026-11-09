import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Phone, X } from 'lucide-react';
import { Button, Card, EmptyState, FareCard, ListSkeleton, Skeleton, StatusBadge, cx } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { useDraft } from '../../contexts/BookingContext';
import { useToast } from '../../contexts/ToastContext';
import { useBooking, useMyBookings } from '../../hooks/useData';
import { fmtDate, fmtDateTime, OPERATOR_PHONE, tripLabel } from '../../utils/format';
import { BookingCard } from './Home';
import type { BookingDetail as BD, BookingStatus } from '../../types';

export function Bookings() {
  const { isGuest } = useAuth();
  const { data, isLoading } = useMyBookings();
  const [tab, setTab] = useState<'all' | BookingStatus>('all');
  const list = (data ?? []).filter((b) => tab === 'all' || b.status === tab);
  return (
    <div>
      <h1 className="font-heading font-bold text-xl text-navy px-4 pt-5">My Bookings</h1>
      {isGuest && (
        <Card className="m-4 bg-amber/15 text-sm">Showing bookings from this guest session. <Link to="/auth/login" className="text-navy font-semibold underline">Log in</Link> to access your complete history.</Card>
      )}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto" role="tablist">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cx('px-4 min-h-[40px] rounded-full text-sm capitalize whitespace-nowrap', tab === t ? 'bg-navy text-white' : 'bg-white border border-gray-200')}>{t}</button>
        ))}
      </div>
      {isLoading ? <ListSkeleton /> : list.length ? <div className="px-4 space-y-3">{list.map((b) => <BookingCard key={b.id} b={b} />)}</div> : (
        <EmptyState emoji="🧳" title="No bookings yet. Book your first trip!"><Link to="/booking/step-1"><Button>Book a Trip</Button></Link></EmptyState>
      )}
    </div>
  );
}

function Timeline({ b }: { b: BD }) {
  const decided = b.status !== 'pending';
  const decisionAt = b.booking_status_history.find((h) => h.status === b.status && h.status !== 'pending')?.created_at;
  const Step = ({ done, bad, pulse, label, sub }: { done?: boolean; bad?: boolean; pulse?: boolean; label: string; sub?: string }) => (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={cx('w-7 h-7 rounded-full grid place-items-center text-white', bad ? 'bg-danger' : done ? 'bg-success' : 'bg-pending', pulse && 'animate-pulse')}>
          {bad ? <X size={14} /> : done ? <Check size={14} /> : <span className="w-2 h-2 bg-white rounded-full" />}
        </div>
        <div className="w-0.5 flex-1 bg-gray-200 my-1 last:hidden" />
      </div>
      <div className="pb-4"><p className="font-medium text-sm">{label}</p>{sub && <p className="text-xs text-muted">{sub}</p>}</div>
    </div>
  );
  return (
    <Card>
      <p className="font-heading font-semibold text-navy mb-3">Status</p>
      <Step done label="Submitted" sub={fmtDateTime(b.created_at)} />
      <Step done={decided} pulse={!decided} label="Under Review" sub={decided ? undefined : 'Our team is reviewing your request'} />
      {decided ? <Step done={b.status === 'approved'} bad={b.status === 'rejected'} label={b.status === 'approved' ? 'Approved' : 'Rejected'} sub={decisionAt && fmtDateTime(decisionAt)} /> : <Step label="Approved / Rejected" />}
    </Card>
  );
}

export function BookingDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { set } = useDraft();
  const { data: b, isLoading, error } = useBooking(id);
  if (isLoading) return <div className="p-4 space-y-3"><Skeleton className="h-20" /><Skeleton className="h-48" /></div>;
  if (error || !b) return <EmptyState emoji="🔒" title="Booking not found"><Link to="/bookings" className="text-navy underline">Back to bookings</Link></EmptyState>;

  const fare = { baseFare: b.base_fare, permitCharge: b.permit_charge, dayBata: b.day_bata, nightBata: b.night_bata, toll: b.toll_tax, total: b.final_total ?? b.total_estimate };
  const nights = Math.max(0, b.duration_days - 1);
  const rebook = () => {
    set({
      customer_name: b.customer_name, phone: b.phone.replace(/^\+?91/, ''), email: b.email ?? '', start_date: '', end_date: '', pickup: b.pickup, dropoff: b.dropoff,
      special_requests: b.special_requests ?? '', distance_km: Number(b.distance_km), trip_type: b.trip_type, stops: b.stops ?? [], leg_km: [], route_sig: '', states_sig: '', route_states: [], seats: b.booking_seats.map((s) => s.seat_no).sort((x, y) => x - y),
      small_bags: b.small_bags, large_bags: b.large_bags, oversized_items: b.oversized_items, states: b.booking_permits.map((p) => p.state),
    });
    nav('/booking/step-1');
  };
  const Row = ({ l, v }: { l: string; v: string }) => <div className="flex justify-between gap-4 py-1 text-sm"><span className="text-muted">{l}</span><span className="text-right font-medium">{v}</span></div>;

  return (
    <div className="pb-6">
      <div className="flex items-center gap-1 px-2 pt-2"><Link to="/bookings" aria-label="Back" className="w-12 h-12 grid place-items-center"><ArrowLeft /></Link>
        <button className="font-mono font-bold text-navy flex items-center gap-2" onClick={() => { navigator.clipboard?.writeText(b.booking_reference); toast('Reference copied', 'success'); }}>{b.booking_reference}<Copy size={14} /></button>
        <div className="ml-auto pr-2"><StatusBadge status={b.status} /></div>
      </div>
      <div className="px-4 space-y-4 mt-2">
        {b.admin_note && <Card className="bg-navy/5 border-navy/20"><p className="text-xs font-semibold text-muted">MESSAGE FROM URBANIA</p><p className="text-sm mt-1">{b.admin_note}</p></Card>}
        <Timeline b={b} />
        <Card>
          <p className="font-heading font-semibold text-navy mb-1">Trip details</p>
          <Row l="Pickup" v={b.pickup} /><Row l="Drop" v={b.dropoff} /><Row l="Dates" v={`${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}`} />
          <Row l="Trip type" v={tripLabel(b.trip_type)} />{b.stops?.length > 0 && <Row l="Via" v={b.stops.join(' → ')} />}<Row l="Duration" v={`${b.duration_days} days`} /><Row l="Seats" v={`${b.seat_count} (${b.booking_seats.map((s) => s.seat_no).sort((x, y) => x - y).join(', ')})`} />
          <Row l="Luggage (S/L/XL)" v={`${b.small_bags} / ${b.large_bags} / ${b.oversized_items}`} />
          {b.special_requests && <Row l="Notes" v={b.special_requests} />}
        </Card>
        <FareCard fare={fare} permits={b.booking_permits} days={b.duration_days} nights={nights} dayRate={b.day_bata / b.duration_days} nightRate={nights ? b.night_bata / nights : 0} distanceKm={Number(b.billed_km)} kmRate={Number(b.billed_km) ? b.base_fare / Number(b.billed_km) : undefined} tripType={b.trip_type} />
        {b.admin_override && <p className="text-xs text-muted">Final fare was adjusted by our team.</p>}
        {b.status === 'approved' && <a href={`tel:${OPERATOR_PHONE}`}><Button full variant="success"><Phone size={16} /> Contact Us</Button></a>}
        {b.status === 'rejected' && <Button full onClick={rebook}>Rebook / Modify</Button>}
      </div>
    </div>
  );
}
