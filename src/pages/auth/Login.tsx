import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Button, Field, useCountdown } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { Logo } from './Splash';

export function Login() {
  const nav = useNavigate();
  const { user, loading, sendOtp, verifyOtp, continueAsGuest } = useAuth();
  const [phone, setPhone] = useState('');
  const [stage, setStage] = useState<'phone' | 'otp'>('phone');
  const [otp, setOtp] = useState<string[]>(Array(6).fill(''));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { left, start } = useCountdown(30);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { if (!loading && user) nav('/home', { replace: true }); }, [user, loading, nav]);
  useEffect(() => { if (stage === 'otp') boxes.current[0]?.focus(); }, [stage]);

  const valid = /^[6-9]\d{9}$/.test(phone);
  const send = async () => {
    setErr(''); setBusy(true);
    try { await sendOtp(phone); setStage('otp'); setOtp(Array(6).fill('')); start(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const verify = async (code = otp.join('')) => {
    if (code.length < 6) return setErr('Enter the 6-digit OTP');
    setErr(''); setBusy(true);
    try { await verifyOtp(phone, code); nav('/home', { replace: true }); }
    catch (e) { setErr((e as Error).message); setOtp(Array(6).fill('')); boxes.current[0]?.focus(); }
    setBusy(false);
  };
  const setDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, '');
    if (d.length > 1) { // paste
      const arr = d.slice(0, 6).split(''); setOtp([...arr, ...Array(6 - arr.length).fill('')]);
      if (arr.length === 6) verify(arr.join('')); return;
    }
    const n = [...otp]; n[i] = d; setOtp(n);
    if (d && i < 5) boxes.current[i + 1]?.focus();
    if (n.every(Boolean)) verify(n.join(''));
  };
  const guest = async () => {
    setBusy(true);
    try { await continueAsGuest(); nav('/home', { replace: true }); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-white max-w-md mx-auto px-6 pt-10 pb-6 flex flex-col">
      <div className="text-navy flex justify-center"><Logo size="sm" /></div>
      <h1 className="font-heading font-bold text-3xl text-navy mt-12">Welcome</h1>
      <p className="text-muted mt-1 mb-8">{stage === 'phone' ? 'Enter your phone number to continue' : `Enter the OTP sent to +91 ${phone}`}</p>

      {stage === 'phone' ? (
        <div className="space-y-4">
          <div className="flex gap-2 items-start">
            <div className="min-h-[48px] mt-6 px-3 rounded-xl border border-gray-200 flex items-center gap-1 text-ink">🇮🇳 +91</div>
            <Field label="Phone number" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} className="flex-1"
              error={phone.length === 10 && !valid ? 'Enter a valid 10-digit mobile number' : err} placeholder="98765 43210" />
          </div>
          <Button full disabled={!valid} loading={busy} onClick={send}>Send OTP</Button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex gap-2 justify-between">
            {otp.map((d, i) => (
              <input key={i} ref={(el) => { boxes.current[i] = el; }} value={d} inputMode="numeric" autoComplete="one-time-code" aria-label={`OTP digit ${i + 1}`}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => e.key === 'Backspace' && !otp[i] && i > 0 && boxes.current[i - 1]?.focus()}
                className="w-12 h-14 text-center text-xl font-semibold rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber outline-none" />
            ))}
          </div>
          {err && <p className="text-sm text-danger" role="alert">{err}</p>}
          <Button full loading={busy} onClick={() => verify()}>Verify OTP</Button>
          <p className="text-center text-sm text-muted">
            {left > 0 ? `Resend OTP in 00:${String(left).padStart(2, '0')}` : <button className="text-navy font-semibold" onClick={send}>Resend OTP</button>}
          </p>
          <button className="block mx-auto text-sm text-muted" onClick={() => { setStage('phone'); setErr(''); }}>Change number</button>
        </div>
      )}

      <div className="mt-auto pt-10 text-center space-y-3">
        <button onClick={guest} disabled={busy} className="text-navy font-medium min-h-[48px]">Continue as Guest</button>
        <div><Link to="/admin/login" className="text-xs text-muted">Admin? Login Here</Link></div>
      </div>
    </div>
  );
}

export function AdminLogin() {
  const nav = useNavigate();
  const { adminLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await adminLogin(email.trim(), pw); nav('/admin/dashboard', { replace: true }); }
    catch (x) { setErr((x as Error).message); }
    setBusy(false);
  };
  return (
    <div className="min-h-screen bg-navy grid place-items-center p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4">
        <p className="text-xs font-semibold tracking-widest text-amber-dark">ADMIN PORTAL</p>
        <h1 className="font-heading font-bold text-2xl text-navy">Sign in</h1>
        <Field label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <div className="relative">
          <Field label="Password" type={show ? 'text' : 'password'} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
          <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)} className="absolute right-3 top-8 p-1 text-muted">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
        {err && <p className="text-sm text-danger" role="alert">{err}</p>}
        <Button full type="submit" loading={busy}>Login</Button>
        <Link to="/auth/login" className="block text-center text-sm text-muted">Back to Customer Login</Link>
      </form>
    </div>
  );
}
