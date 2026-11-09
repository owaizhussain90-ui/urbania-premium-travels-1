import { supabase } from '../lib/supabase';
import type { AppNotification, Booking, BookingDetail, BookingDraft, BookingStatus, FareConfig, StatePermit } from '../types';

const unwrap = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export const api = {
  async fareConfig(): Promise<FareConfig> {
    return unwrap(await supabase.from('fare_configurations').select('*').eq('id', 1).single());
  },
  async updateFareConfig(c: Partial<FareConfig>) {
    unwrap(await supabase.from('fare_configurations').update({ ...c, updated_at: new Date().toISOString() }).eq('id', 1).select());
  },
  // Days already taken by anyone's pending or approved booking. Dates only, never who booked them.
  async unavailableDates(): Promise<string[]> {
    const rows = unwrap(await supabase.rpc('unavailable_dates')) as { day: string }[] | string[];
    return (rows ?? []).map((r) => (typeof r === 'string' ? r : r.day));
  },
  async statePermits(): Promise<StatePermit[]> {
    return unwrap(await supabase.from('state_permits').select('*').order('state'));
  },
  async upsertPermit(p: StatePermit) {
    unwrap(await supabase.from('state_permits').upsert(p).select());
  },
  async deletePermit(state: string) {
    unwrap(await supabase.from('state_permits').delete().eq('state', state).select());
  },
  async createBooking(d: BookingDraft): Promise<{ id: string; booking_reference: string; total_estimate: number }> {
    return unwrap(await supabase.rpc('create_booking', { p: d }));
  },
  async myBookings(): Promise<Booking[]> {
    return unwrap(await supabase.from('bookings').select('*').order('created_at', { ascending: false }));
  },
  async booking(id: string): Promise<BookingDetail> {
    return unwrap(
      await supabase
        .from('bookings')
        .select('*, booking_seats(seat_no), booking_permits(state, fee), booking_status_history(id,status,note,created_at)')
        .eq('id', id)
        .single(),
    );
  },
  async adminBookings(): Promise<Booking[]> {
    return unwrap(await supabase.from('bookings').select('*').order('created_at', { ascending: false }).limit(1000));
  },
  async decide(id: string, decision: Exclude<BookingStatus, 'pending'>, note: string, override: Record<string, number> | null) {
    unwrap(await supabase.rpc('admin_decide_booking', { p_id: id, p_decision: decision, p_note: note, p_override: override }));
  },
  async applyVerifiedDistance(id: string) {
    unwrap(await supabase.rpc('admin_apply_verified_distance', { p_id: id }));
  },
  async recordToll(id: string, amount: number) {
    unwrap(await supabase.rpc('admin_record_toll', { p_id: id, p_amount: amount }));
  },
  async notifications(): Promise<AppNotification[]> {
    return unwrap(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100));
  },
  async markAllRead() {
    unwrap(await supabase.from('notifications').update({ read: true }).eq('read', false).select());
  },
  async markRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
  },
};
