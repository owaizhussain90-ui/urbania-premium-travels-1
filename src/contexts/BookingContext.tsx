import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { BookingDraft } from '../types';

export const emptyDraft: BookingDraft = {
  customer_name: '', phone: '', email: '', start_date: '', end_date: '', pickup: '', dropoff: '',
  special_requests: '', distance_km: 0, trip_type: 'one_way', stops: [], leg_km: [], route_sig: '', states_sig: '', route_states: [], seats: [], small_bags: 0, large_bags: 0, oversized_items: 0, states: [],
};

interface Ctx {
  draft: BookingDraft;
  update: (p: Partial<BookingDraft>) => void;
  reset: () => void;
  set: (d: BookingDraft) => void;
}
const C = createContext<Ctx>(null!);
export const useDraft = () => useContext(C);

const KEY = 'upt-draft';

export function BookingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<BookingDraft>(() => {
    try { return { ...emptyDraft, ...JSON.parse(sessionStorage.getItem(KEY) || '{}') }; } catch { return emptyDraft; }
  });
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(draft)); } catch { /* ignore */ } }, [draft]);
  return (
    <C.Provider value={{ draft, update: (p) => setDraft((d) => ({ ...d, ...p })), reset: () => setDraft(emptyDraft), set: setDraft }}>
      {children}
    </C.Provider>
  );
}
