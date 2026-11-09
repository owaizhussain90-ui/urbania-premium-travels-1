import { Suspense, useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, CalendarCheck, Download, Home, LogOut, PlusCircle, Settings, User, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications, useRealtime } from '../hooks/useData';
import { ListSkeleton, StepIndicator, cx } from '../components/ui';

// ── PWA install prompt ──
function InstallPrompt() {
  const [evt, setEvt] = useState<any>(null);
  const [hidden, setHidden] = useState(() => localStorage.getItem('upt-install-dismissed') === '1');
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  if (!evt || hidden) return null;
  return (
    <div className="mx-4 mt-3 bg-navy text-white rounded-2xl p-3 flex items-center gap-3 text-sm">
      <Download size={20} className="text-amber shrink-0" />
      <span className="flex-1">Install Urbania on your home screen</span>
      <button className="bg-amber text-navy font-semibold px-3 py-2 rounded-lg" onClick={async () => { await evt.prompt(); setEvt(null); }}>Install</button>
      <button aria-label="Dismiss" className="px-1" onClick={() => { localStorage.setItem('upt-install-dismissed', '1'); setHidden(true); }}>✕</button>
    </div>
  );
}

function BottomNav() {
  const { user } = useAuth();
  const { data } = useNotifications(!!user);
  const unread = data?.filter((n) => !n.read).length ?? 0;
  const tabs = [
    { to: '/home', label: 'Home', Icon: Home },
    { to: '/booking/step-1', label: 'Book', Icon: PlusCircle },
    { to: '/bookings', label: 'Bookings', Icon: CalendarCheck },
    { to: '/notifications', label: 'Alerts', Icon: Bell },
    { to: '/profile', label: 'Profile', Icon: User },
  ];
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 safe-bottom" aria-label="Primary">
      <div className="max-w-md mx-auto grid grid-cols-5">
        {tabs.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => cx('relative flex flex-col items-center justify-center min-h-[56px] text-[11px] gap-0.5', isActive ? 'text-navy font-semibold' : 'text-muted')}>
            <Icon size={22} />
            {label}
            {label === 'Alerts' && unread > 0 && <span className="absolute top-1.5 right-[28%] bg-danger text-white text-[10px] rounded-full min-w-[16px] h-4 px-1 grid place-items-center">{unread}</span>}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

// Requires a session (phone login or guest). Redirects to login otherwise.
export function CustomerLayout() {
  const { user, loading } = useAuth();
  useRealtime();
  if (loading) return <ListSkeleton />;
  if (!user) return <Navigate to="/auth/login" replace />;
  return (
    <div className="max-w-md mx-auto min-h-screen pb-[84px] bg-surface">
      <InstallPrompt />
      <Suspense fallback={<ListSkeleton />}><Outlet /></Suspense>
      <BottomNav />
    </div>
  );
}

export function BookingLayout() {
  const loc = useLocation();
  const nav = useNavigate();
  const step = Number(loc.pathname.match(/step-(\d)/)?.[1] ?? 1);
  const titles = ['Trip Details', 'Vehicle Configuration', 'Permits & Charges', 'Review Your Booking'];
  const back = () => (step === 1 ? nav('/home') : nav(`/booking/step-${step - 1}`));
  return (
    <>
      <header className="sticky top-0 z-30 bg-surface safe-top">
        <div className="flex items-center gap-2 px-2 pt-2">
          <button onClick={back} aria-label="Back" className="w-12 h-12 grid place-items-center"><ArrowLeft /></button>
          <h1 className="font-heading font-semibold text-lg text-navy">{titles[step - 1]}</h1>
        </div>
        <StepIndicator step={step} />
      </header>
      <div key={step} className="animate-slideIn"><Outlet /></div>
    </>
  );
}

// Sticky CTA pinned above the bottom nav.
export function StickyCta({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-x-0 bottom-[56px] z-30 safe-bottom"><div className="max-w-md mx-auto px-4 py-3 bg-gradient-to-t from-surface via-surface to-transparent">{children}</div></div>;
}

export function RequireAdmin() {
  const { user, isAdmin, loading, logout } = useAuth();
  const nav = useNavigate();
  useRealtime();
  const [alert, setAlert] = useState(false);
  useEffect(() => {
    const h = () => setAlert(true);
    window.addEventListener('upt-new-booking', h);
    return () => window.removeEventListener('upt-new-booking', h);
  }, []);
  if (loading) return <ListSkeleton />;
  if (!user || !isAdmin) return <Navigate to="/admin/login" replace />;
  const link = ({ isActive }: { isActive: boolean }) => cx('flex items-center gap-2 px-3 py-2 rounded-lg text-sm', isActive ? 'bg-white/15 text-white' : 'text-white/70');
  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-navy text-white sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <h1 className="font-heading font-semibold mr-auto">Urbania Admin</h1>
          <NavLink to="/admin/dashboard" className={link}><LayoutDashboard size={16} /> Dashboard</NavLink>
          <NavLink to="/admin/fares" className={link}><Settings size={16} /> Fare Config</NavLink>
          <button aria-label="Logout" onClick={async () => { await logout(); nav('/admin/login'); }} className="p-2"><LogOut size={18} /></button>
        </div>
      </header>
      {alert && (
        <div className="bg-amber text-navy text-sm font-medium px-4 py-2 flex justify-between max-w-6xl mx-auto">
          <span>🔔 New booking request received</span><button onClick={() => setAlert(false)}>Dismiss</button>
        </div>
      )}
      <main className="max-w-6xl mx-auto p-4"><Suspense fallback={<ListSkeleton />}><Outlet /></Suspense></main>
    </div>
  );
}
