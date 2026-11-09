import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, MessageCircle, Phone } from 'lucide-react';
import { Button, Card, EmptyState, Field, ListSkeleton, cx } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useNotifications } from '../../hooks/useData';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';
import { fmtDateTime, OPERATOR_PHONE, OPERATOR_WHATSAPP } from '../../utils/format';

export function Profile() {
  const nav = useNavigate();
  const toast = useToast();
  const { user, isGuest, fullName, phone, updateName, logout } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(fullName);
  const [push, setPush] = useState(() => localStorage.getItem('upt-push') === '1');

  const togglePush = async () => {
    if (push) { localStorage.setItem('upt-push', '0'); setPush(false); await supabase.from('profiles').upsert({ id: user!.id, push_enabled: false }); return; }
    if (!('Notification' in window)) return toast('Push notifications are not supported on this device. You will still get in-app alerts.', 'info');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Notifications are blocked in your browser settings.', 'error');
    localStorage.setItem('upt-push', '1'); setPush(true);
    if (!isGuest) await supabase.from('profiles').upsert({ id: user!.id, push_enabled: true });
    toast('Notifications enabled', 'success');
  };
  const initials = (fullName || (isGuest ? 'G' : phone.slice(-2) || 'U')).split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  const Item = ({ to, label, Icon }: { to: string; label: string; Icon?: typeof Phone }) => (
    <Link to={to} className="flex items-center gap-3 min-h-[52px] px-4 border-b border-gray-100 last:border-0">{Icon && <Icon size={18} className="text-muted" />}<span className="flex-1">{label}</span><ChevronRight size={16} className="text-muted" /></Link>
  );
  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col items-center py-4">
        <div className="w-20 h-20 rounded-full bg-navy text-amber font-heading font-bold text-2xl grid place-items-center">{initials}</div>
        <p className="font-heading font-semibold text-navy mt-3">{isGuest ? 'Guest' : fullName || 'Your name'}</p>
        {!isGuest && <p className="text-sm text-muted">+91 {phone}</p>}
      </div>
      {isGuest ? (
        <Card className="bg-amber/15 text-sm"><p>Log in with your phone number to unlock your full profile and booking history.</p><Link to="/auth/login" className="text-navy font-semibold underline inline-block mt-2">Log in</Link></Card>
      ) : editing ? (
        <Card className="space-y-3"><Field label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex gap-2"><Button className="flex-1" onClick={async () => { try { await updateName(name.trim()); setEditing(false); toast('Profile updated', 'success'); } catch (e) { toast((e as Error).message, 'error'); } }}>Save</Button><Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div></Card>
      ) : <Button full variant="navy" onClick={() => setEditing(true)}>Edit Profile</Button>}
      <Card className="p-0 overflow-hidden">
        <Item to="/bookings" label="My Bookings" />
        <div className="flex items-center justify-between min-h-[52px] px-4 border-b border-gray-100"><span>Push notifications</span>
          <button role="switch" aria-checked={push} onClick={togglePush} className={cx('w-12 h-7 rounded-full p-0.5 transition', push ? 'bg-success' : 'bg-gray-300')}><span className={cx('block w-6 h-6 bg-white rounded-full transition', push && 'translate-x-5')} /></button></div>
        <Item to="/terms" label="Terms & Conditions" />
        <Item to="/terms" label="Privacy Policy" />
        <a href={`tel:${OPERATOR_PHONE}`} className="flex items-center gap-3 min-h-[52px] px-4 border-b border-gray-100"><Phone size={18} className="text-muted" /><span className="flex-1">Call Support</span></a>
        <a href={`https://wa.me/${OPERATOR_WHATSAPP}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 min-h-[52px] px-4"><MessageCircle size={18} className="text-muted" /><span className="flex-1">WhatsApp Support</span></a>
      </Card>
      <button className="w-full text-danger font-semibold min-h-[48px]" onClick={async () => { await logout(); nav('/auth/login', { replace: true }); }}>{isGuest ? 'End guest session' : 'Logout'}</button>
    </div>
  );
}

export function Notifications() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useNotifications();
  const unread = data?.some((n) => !n.read);
  return (
    <div>
      <div className="flex items-center justify-between px-4 pt-5">
        <h1 className="font-heading font-bold text-xl text-navy">Notifications</h1>
        {unread && <button className="text-sm text-navy font-medium min-h-[44px]" onClick={async () => { await api.markAllRead(); qc.invalidateQueries({ queryKey: ['notifications'] }); }}>Mark All as Read</button>}
      </div>
      {isLoading ? <ListSkeleton /> : !data?.length ? <EmptyState emoji="🔔" title="No notifications yet" /> : (
        <div className="p-4 space-y-3">
          {data.map((n) => (
            <button key={n.id} className="w-full text-left" onClick={async () => { await api.markRead(n.id); qc.invalidateQueries({ queryKey: ['notifications'] }); if (n.booking_id) nav(`/bookings/${n.booking_id}`); }}>
              <Card className="flex gap-3">
                <span className={cx('w-2.5 h-2.5 rounded-full mt-1.5 shrink-0', n.read ? 'bg-transparent' : 'bg-blue-500')} />
                <div><p className="font-medium text-sm">{n.title}</p><p className="text-sm text-muted">{n.body}</p><p className="text-xs text-muted mt-1">{fmtDateTime(n.created_at)}</p></div>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Terms() {
  const S = ({ t, children }: { t: string; children: string }) => <section><h2 className="font-heading font-semibold text-navy mt-5 mb-1">{t}</h2><p className="text-sm text-ink/90 leading-relaxed">{children}</p></section>;
  return (
    <div className="max-w-md mx-auto bg-white min-h-screen px-4 pb-10">
      <div className="py-2"><button onClick={() => history.back()} aria-label="Back" className="w-12 h-12 grid place-items-center"><ArrowLeft /></button></div>
      <h1 className="font-heading font-bold text-2xl text-navy">Terms & Conditions</h1>
      <S t="Booking Policy">A booking request is confirmed only after approval by Urbania Premium Travels. You will be notified by SMS and in the app. Submitting a request does not guarantee availability.</S>
      <S t="Cancellation Policy">Cancellations should be communicated to the operator as early as possible. Cancellation charges, if any, will be advised at the time of approval based on how close the cancellation is to the trip start date.</S>
      <S t="Fare Disclaimer">All fares shown in the app are estimates. Toll tax is calculated from an approximate route distance and actual tolls may vary. The final amount is confirmed by the admin at approval and may be adjusted.</S>
      <S t="Permit Responsibilities">The vehicle carries an All India Permit. Additional state permit fees, where applicable, are included in the estimate. Customers must disclose the full route when booking.</S>
      <S t="Driver Conduct">Drivers follow all traffic and safety regulations. Passengers are expected to treat the vehicle and driver respectfully. Driver bata covers daily allowances for the trip duration.</S>
      <S t="Privacy">We collect your name, phone number, email and trip details solely to process and communicate about your booking. We do not sell your data.</S>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center text-center p-6 bg-surface">
      <div><div className="text-6xl mb-3">🚐💨</div><h1 className="font-heading font-bold text-2xl text-navy">Page Not Found</h1><p className="text-muted mt-1 mb-6">Looks like this van took a wrong turn.</p><Link to="/home"><Button>Go Back Home</Button></Link></div>
    </div>
  );
}
