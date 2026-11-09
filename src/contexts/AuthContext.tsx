import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { toE164 } from '../utils/format';

interface AuthCtx {
  loading: boolean;
  user: User | null;
  session: Session | null;
  isGuest: boolean;
  isAdmin: boolean;
  fullName: string;
  phone: string;
  sendOtp: (phone10: string) => Promise<void>;
  verifyOtp: (phone10: string, token: string) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  adminLogin: (email: string, password: string) => Promise<void>;
  updateName: (name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [fullName, setFullName] = useState('');

  const hydrate = useCallback(async (s: Session | null) => {
    setSession(s);
    if (s?.user && !s.user.is_anonymous) {
      const [{ data: a }, { data: p }] = await Promise.all([
        supabase.from('admin_users').select('user_id').eq('user_id', s.user.id).maybeSingle(),
        supabase.from('profiles').select('full_name').eq('id', s.user.id).maybeSingle(),
      ]);
      setIsAdmin(!!a);
      setFullName(p?.full_name ?? '');
    } else {
      setIsAdmin(false);
      setFullName('');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => hydrate(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      // defer to avoid deadlocks inside the auth callback
      setTimeout(() => hydrate(s), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [hydrate]);

  const user = session?.user ?? null;

  const value: AuthCtx = {
    loading,
    user,
    session,
    isGuest: !!user?.is_anonymous,
    isAdmin,
    fullName,
    phone: user?.phone ? user.phone.replace(/^\+?91/, '') : '',
    async sendOtp(phone10) {
      const { error } = await supabase.auth.signInWithOtp({ phone: toE164(phone10) });
      if (error) throw new Error(error.message);
    },
    async verifyOtp(phone10, token) {
      const { error } = await supabase.auth.verifyOtp({ phone: toE164(phone10), token, type: 'sms' });
      if (error) throw new Error(error.message.toLowerCase().includes('expired') ? 'OTP expired. Please request a new one.' : 'Invalid OTP. Please try again.');
    },
    async continueAsGuest() {
      if (session) return;
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw new Error(error.message);
    },
    async adminLogin(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error('Invalid email or password');
      const { data: a } = await supabase.from('admin_users').select('user_id').eq('user_id', data.user.id).maybeSingle();
      if (!a) {
        await supabase.auth.signOut();
        throw new Error('This account is not authorised for the admin portal');
      }
    },
    async updateName(name) {
      if (!user) return;
      const { error } = await supabase.from('profiles').upsert({ id: user.id, full_name: name, phone: user.phone ?? null });
      if (error) throw new Error(error.message);
      setFullName(name);
    },
    async logout() {
      await supabase.auth.signOut();
      setIsAdmin(false);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
