import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calculator, CheckCircle2, Bus } from 'lucide-react';
import { Button } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';

export const Logo = ({ size = 'md' }: { size?: 'sm' | 'md' }) => (
  <div className="flex items-center gap-2">
    <div className={`${size === 'sm' ? 'w-8 h-8' : 'w-14 h-14'} rounded-xl bg-amber grid place-items-center text-navy`}><Bus size={size === 'sm' ? 18 : 30} /></div>
    <div className="leading-tight"><p className={`font-heading font-bold ${size === 'sm' ? 'text-sm' : 'text-xl'}`}>Urbania</p><p className={`${size === 'sm' ? 'text-[10px]' : 'text-xs'} tracking-widest opacity-80`}>PREMIUM TRAVELS</p></div>
  </div>
);

export function Splash() {
  const nav = useNavigate();
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      const seen = localStorage.getItem('upt-onboarded') === '1';
      nav(!seen ? '/onboarding' : user ? '/home' : '/auth/login', { replace: true });
    }, 2200);
    return () => clearTimeout(t);
  }, [loading, user, nav]);
  return (
    <div className="min-h-screen bg-gradient-to-b from-navy to-[#0d1b2e] text-white grid place-items-center">
      <div className="flex flex-col items-center gap-6 px-6 text-center">
        <Logo />
        <div className="w-9 h-9 rounded-full border-4 border-amber/30 border-t-amber animate-spin" aria-label="Loading" />
        <p className="text-sm opacity-90">Your Premium Journey, Perfectly Planned</p>
      </div>
    </div>
  );
}

const slides = [
  { Icon: Bus, title: 'Book a 16-Seater, Anywhere in India', body: 'Urbania vans with All India Permit for groups, tours and events.' },
  { Icon: Calculator, title: 'Know Your Full Fare Before You Book', body: 'Seats, luggage, permits, tolls and driver bata — itemised upfront.' },
  { Icon: CheckCircle2, title: 'Admin-Confirmed Bookings, Zero Surprises', body: 'Every request is reviewed and confirmed by our team.' },
];

export function Onboarding() {
  const nav = useNavigate();
  const [i, setI] = useState(0);
  const x0 = useRef(0);
  const finish = () => { localStorage.setItem('upt-onboarded', '1'); nav('/auth/login', { replace: true }); };
  const S = slides[i];
  return (
    <div className="min-h-screen bg-navy text-white flex flex-col"
      onTouchStart={(e) => (x0.current = e.touches[0].clientX)}
      onTouchEnd={(e) => { const d = e.changedTouches[0].clientX - x0.current; if (d < -50 && i < 2) setI(i + 1); if (d > 50 && i > 0) setI(i - 1); }}>
      <div className="flex justify-end p-4"><button onClick={finish} className="text-sm opacity-80 min-h-[48px] px-2">Skip</button></div>
      <div key={i} className="flex-1 flex flex-col items-center justify-center text-center px-8 animate-slideIn">
        <div className="w-28 h-28 rounded-3xl bg-amber text-navy grid place-items-center mb-8"><S.Icon size={56} /></div>
        <h2 className="font-heading font-bold text-2xl mb-3">{S.title}</h2>
        <p className="opacity-80 max-w-xs">{S.body}</p>
      </div>
      <div className="p-6 space-y-5 max-w-md w-full mx-auto">
        <div className="flex justify-center gap-2">{slides.map((_, n) => <span key={n} className={`h-2 rounded-full transition-all ${n === i ? 'w-6 bg-amber' : 'w-2 bg-white/30'}`} />)}</div>
        <Button full onClick={() => (i < 2 ? setI(i + 1) : finish())}>{i < 2 ? 'Next' : 'Get Started'}</Button>
      </div>
    </div>
  );
}
