import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Bus, CalendarCheck, User } from 'lucide-react';
import { Button, Card, EmptyState, Skeleton, StatusBadge } from '../../components/ui';
import { DESTINATIONS } from '../../data/destinations';
import { useDraft } from '../../contexts/BookingContext';
import { useAuth } from '../../contexts/AuthContext';
import { useMyBookings } from '../../hooks/useData';
import { fmtDate, inr } from '../../utils/format';
import { Logo } from '../auth/Splash';
import type { Booking } from '../../types';

export function BookingCard({ b }: { b: Booking }) {
  return (
    <Link to={`/bookings/${b.id}`} className="block">
      <Card className="active:scale-[.99] transition">
        <div className="flex justify-between items-start gap-2">
          <span className="font-mono text-xs font-bold text-navy">{b.booking_reference}</span>
          <StatusBadge status={b.status} />
        </div>
        <p className="mt-2 font-medium text-ink text-sm">{b.pickup} <ArrowRight size={12} className="inline" /> {b.dropoff}</p>
        <div className="flex justify-between mt-1 text-xs text-muted">
          <span>{fmtDate(b.start_date)} – {fmtDate(b.end_date)}</span>
          <span className="font-semibold text-ink">{inr(b.final_total ?? b.total_estimate)}</span>
        </div>
      </Card>
    </Link>
  );
}

export function Home() {
  const { isGuest } = useAuth();
  const nav = useNavigate();
  const { update } = useDraft();
  const { data, isLoading } = useMyBookings(!isGuest);
  return (
    <div>
      <header className="flex items-center justify-between px-4 py-3 text-navy safe-top">
        <Logo size="sm" />
        <Link to="/profile" aria-label="Profile" className="w-11 h-11 rounded-full bg-navy text-white grid place-items-center"><User size={20} /></Link>
      </header>
      <section className="mx-4 rounded-3xl bg-gradient-to-br from-navy to-[#2c4a74] text-white p-6 relative overflow-hidden">
        <Bus size={160} className="absolute -right-8 -bottom-6 opacity-10" />
        <p className="text-xs tracking-widest text-amber font-semibold">16-SEATER · ALL INDIA PERMIT</p>
        <h1 className="font-heading font-bold text-2xl mt-2 leading-snug">Book Your Urbania Today</h1>
        <p className="text-sm opacity-80 mt-2 max-w-[16rem]">Transparent fare, admin-confirmed bookings.</p>
      </section>
      <div className="px-4 mt-4 space-y-4">
        <Button full className="min-h-[56px] text-base" onClick={() => nav('/booking/step-1')}>Book a Trip</Button>
        <Link to="/bookings"><Card className="flex items-center gap-3"><CalendarCheck className="text-navy" /><span className="font-medium flex-1">My Bookings</span><ArrowRight size={16} className="text-muted" /></Card></Link>
        <section aria-labelledby="dest-h">
          <h2 id="dest-h" className="font-heading font-semibold text-navy">Popular getaways from Mysuru</h2>
          <p className="text-xs text-muted mb-2">Tap a place to start planning your trip.</p>
          <div className="-mx-4 px-4 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2">
            {DESTINATIONS.map((d) => (
              <button key={d.id} type="button" onClick={() => { update({ pickup: 'Mysuru, Karnataka', dropoff: d.place }); nav('/booking/step-1'); }}
                className="snap-start shrink-0 w-44 rounded-2xl overflow-hidden bg-white shadow-sm border border-gray-100 text-left active:scale-[0.98] transition-transform">
                <img src={d.image} alt={`${d.name}: ${d.tagline}`} loading="lazy" className="w-full h-28 object-cover" />
                <div className="p-3">
                  <p className="font-heading font-semibold text-navy">{d.name}</p>
                  <p className="text-xs text-muted leading-snug mt-0.5">{d.tagline}</p>
                  <p className="text-xs font-medium text-navy mt-2">About {d.km} km from Mysuru</p>
                </div>
              </button>
            ))}
          </div>
        </section>
        {isGuest ? (
          <Card className="bg-amber/15 border-amber/40 text-sm">
            <p className="font-medium text-navy">You're browsing as a guest</p>
            <p className="text-muted mt-1">Log in with your phone number to keep your full booking history.</p>
            <Link to="/auth/login" className="text-navy font-semibold underline inline-block mt-2">Log in</Link>
          </Card>
        ) : (
          <div>
            <h2 className="font-heading font-semibold text-navy mb-2">Recent bookings</h2>
            {isLoading ? <Skeleton className="h-24" /> : data?.length ? <div className="space-y-3">{data.slice(0, 2).map((b) => <BookingCard key={b.id} b={b} />)}</div> : <EmptyState emoji="🚐" title="No bookings yet. Book your first trip!" />}
          </div>
        )}
      </div>
    </div>
  );
}
