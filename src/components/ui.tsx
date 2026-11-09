import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, forwardRef } from 'react';
import { Check, Loader2, Minus, Plus, X } from 'lucide-react';
import { loadMaps, mapsEnabled } from '../lib/maps';
import { inr } from '../utils/format';
import type { BookingStatus, FareBreakdown } from '../types';

export const cx = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(' ');

// ── Button ──
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'navy' | 'success' | 'danger' | 'outline' | 'ghost'; loading?: boolean; full?: boolean };
export function Button({ variant = 'primary', loading, full, className, children, disabled, ...r }: BtnProps) {
  const v = {
    primary: 'bg-amber text-navy hover:bg-amber-dark',
    navy: 'bg-navy text-white hover:bg-navy/90',
    success: 'bg-success text-white hover:bg-success/90',
    danger: 'bg-danger text-white',
    outline: 'border-2 border-danger text-danger bg-white',
    ghost: 'text-navy bg-transparent',
  }[variant];
  return (
    <button {...r} disabled={disabled || loading}
      className={cx('min-h-[48px] px-5 rounded-xl font-heading font-semibold text-[15px] inline-flex items-center justify-center gap-2 transition active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed', v, full && 'w-full', className)}>
      {loading && <Loader2 size={18} className="animate-spin" />} {children}
    </button>
  );
}

// ── Inputs ──
type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string };
export const Field = forwardRef<HTMLInputElement, FieldProps>(({ label, error, hint, className, id, ...r }, ref) => {
  const fid = id || label.replace(/\W/g, '-');
  return (
    <div className={className}>
      <label htmlFor={fid} className="block text-sm font-medium text-ink mb-1">{label}</label>
      <input id={fid} ref={ref} {...r} className={cx('w-full min-h-[48px] px-4 rounded-xl border bg-white text-ink outline-none focus:ring-2 focus:ring-amber', error ? 'border-danger' : 'border-gray-200')} />
      {hint && !error && <p className="text-xs text-muted mt-1">{hint}</p>}
      {error && <p className="text-xs text-danger mt-1" role="alert">{error}</p>}
    </div>
  );
});

export const TextArea = forwardRef<HTMLTextAreaElement, { label: string; error?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ label, error, ...r }, ref) => (
  <div>
    <label className="block text-sm font-medium text-ink mb-1">{label}</label>
    <textarea ref={ref} rows={3} {...r} className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white outline-none focus:ring-2 focus:ring-amber" />
    {error && <p className="text-xs text-danger mt-1">{error}</p>}
  </div>
));

// Places autocomplete with graceful plain-input fallback when no Maps key is set.
export function PlaceInput({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const attached = useRef(false);
  const onFocus = async () => {
    if (!mapsEnabled || attached.current || !ref.current) return;
    try {
      const g = await loadMaps();
      const ac = new g.maps.places.Autocomplete(ref.current, { componentRestrictions: { country: 'in' }, fields: ['formatted_address', 'name'] });
      ac.addListener('place_changed', () => {
        const p = ac.getPlace();
        onChange(p?.formatted_address || p?.name || ref.current?.value || '');
      });
      attached.current = true;
    } catch { /* fall back to manual entry */ }
  };
  return <Field ref={ref} label={label} value={value} onChange={(e) => onChange(e.target.value)} onFocus={onFocus} error={error} placeholder="Search a place" autoComplete="off" />;
}

// ── Card / Badge / Modal ──
export const Card = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cx('bg-white rounded-2xl shadow-sm border border-gray-100 p-4', className)}>{children}</div>
);

export function StatusBadge({ status }: { status: BookingStatus }) {
  const m = { pending: ['bg-pending/15 text-pending', '⏳ Pending'], approved: ['bg-success/15 text-success', '✓ Approved'], rejected: ['bg-danger/15 text-danger', '✕ Rejected'] }[status];
  return <span className={cx('text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap', m[0])}>{m[1]}</span>;
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5 animate-slideIn" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-semibold text-lg text-navy">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Stepper (luggage counters) ──
export function Counter({ label, hint, value, max, onChange }: { label: string; hint?: string; value: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div><p className="font-medium text-ink">{label}</p>{hint && <p className="text-xs text-muted">{hint}</p>}</div>
      <div className="flex items-center gap-3">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} className="w-12 h-12 rounded-full border border-gray-200 grid place-items-center disabled:opacity-40"><Minus size={18} /></button>
        <span className="w-6 text-center font-semibold tabular-nums">{value}</span>
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="w-12 h-12 rounded-full bg-navy text-white grid place-items-center disabled:opacity-40"><Plus size={18} /></button>
      </div>
    </div>
  );
}

// ── Step indicator ──
export function StepIndicator({ step }: { step: number }) {
  return (
    <div className="px-4 pt-3">
      <div className="flex gap-1.5">{[1, 2, 3, 4].map((n) => <div key={n} className={cx('h-1.5 flex-1 rounded-full', n <= step ? 'bg-amber' : 'bg-gray-200')} />)}</div>
      <p className="text-xs text-muted mt-1.5">Step {step} of 4</p>
    </div>
  );
}

// ── Skeleton / Empty ──
export const Skeleton = ({ className }: { className?: string }) => <div className={cx('animate-pulse bg-gray-200 rounded-xl', className)} />;
export const ListSkeleton = () => <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>;

export function EmptyState({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return <div className="text-center py-14 px-6"><div className="text-5xl mb-3">{emoji}</div><p className="font-heading font-semibold text-navy">{title}</p><div className="mt-4">{children}</div></div>;
}

// ── Receipt-style fare card ──
export function FareCard({ fare, permits, days, nights, dayRate, nightRate, distanceKm, kmRate, tripType }: { fare: FareBreakdown; permits?: { state: string; fee: number }[]; days?: number; nights?: number; dayRate?: number; nightRate?: number; distanceKm?: number; kmRate?: number; tripType?: string }) {
  const Row = ({ l, v, sub }: { l: string; v: ReactNode; sub?: string }) => (
    <div className="flex justify-between py-1.5 text-sm"><div><span className="text-ink">{l}</span>{sub && <p className="text-xs text-muted">{sub}</p>}</div><span className="font-medium tabular-nums">{v}</span></div>
  );
  const settled = fare.toll > 0;
  return (
    <Card className="border-dashed border-2 border-amber/60">
      <p className="text-xs font-semibold tracking-wider text-muted mb-1">{settled ? 'FINAL BILL' : 'ESTIMATED FARE'}</p>
      <Row l="Distance Fare" v={inr(fare.baseFare)} sub={distanceKm && kmRate ? `${distanceKm} km × ${inr(kmRate)}/km${tripType === 'round_trip' ? ' (round trip)' : tripType === 'multi_city' ? ' (multi-city)' : ''}` : undefined} />
      <Row l="All India Permit" v={<span className="text-success">Included</span>} />
      {permits?.map((p) => <Row key={p.state} l={`Permit: ${p.state}`} v={inr(p.fee)} />)}
      {!permits && <Row l="Additional State Permits" v={inr(fare.permitCharge)} />}
      <Row l="Day Bata" v={inr(fare.dayBata)} sub={days != null && dayRate != null ? `${inr(dayRate)} per day × ${days} ${days === 1 ? 'day' : 'days'}` : undefined} />
      <Row l="Night Bata" v={inr(fare.nightBata)} sub={nights != null && nightRate != null ? `${inr(nightRate)} per night × ${nights} ${nights === 1 ? 'night' : 'nights'} (includes halting nights)` : undefined} />
      <Row l="Toll Tax" v={settled ? inr(fare.toll) : <span className="text-muted">At actuals, after trip</span>} />
      <div className="border-t border-gray-200 mt-2 pt-3 flex justify-between items-baseline">
        <span className="font-heading font-semibold text-navy">{settled ? 'Final Fare' : 'Total Estimated Fare'}</span>
        <span className="font-heading font-bold text-2xl text-navy tabular-nums">{inr(fare.total)}</span>
      </div>
      <p className="text-xs text-muted mt-2">{settled ? 'Includes toll tax as per actual toll receipts.' : 'This is an estimated fare. Toll tax is not included; it is charged at actuals after the trip, from the toll statement. Final amount will be confirmed by admin.'}</p>
    </Card>
  );
}

export const CheckRow = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center gap-2 bg-success/10 text-success rounded-xl px-3 py-3 text-sm font-medium"><Check size={18} />{children}</div>
);

export function useCountdown(seconds: number) {
  const [left, setLeft] = useState(0);
  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setLeft(left - 1), 1000); return () => clearTimeout(t); }, [left]);
  return { left, start: () => setLeft(seconds) };
}
