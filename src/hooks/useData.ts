import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export const useFareConfig = () => useQuery({ queryKey: ['fare-config'], queryFn: api.fareConfig, staleTime: 60_000 });
export const useStatePermits = () => useQuery({ queryKey: ['state-permits'], queryFn: api.statePermits, staleTime: 60_000 });
export const useUnavailableDates = () => useQuery({ queryKey: ['unavailable-dates'], queryFn: api.unavailableDates, staleTime: 15_000, refetchOnWindowFocus: true });
export const useMyBookings = (enabled = true) => useQuery({ queryKey: ['bookings'], queryFn: api.myBookings, enabled });
export const useBooking = (id?: string) => useQuery({ queryKey: ['booking', id], queryFn: () => api.booking(id!), enabled: !!id });
export const useNotifications = (enabled = true) => useQuery({ queryKey: ['notifications'], queryFn: api.notifications, enabled });

// Live updates: customers see approvals instantly; admins get new-booking alerts.
export function useRealtime() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`rt-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, (payload) => {
        qc.invalidateQueries({ queryKey: ['bookings'] });
        qc.invalidateQueries({ queryKey: ['admin-bookings'] });
        const id = (payload.new as { id?: string })?.id;
        if (id) qc.invalidateQueries({ queryKey: ['booking', id] });
        if (isAdmin && payload.eventType === 'INSERT') {
          toast(`New booking ${(payload.new as { booking_reference: string }).booking_reference}`, 'info');
          window.dispatchEvent(new CustomEvent('upt-new-booking'));
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
        qc.invalidateQueries({ queryKey: ['notifications'] });
        const n = payload.new as { title: string; body: string };
        toast(`${n.title}: ${n.body}`, n.title.includes('rejected') ? 'error' : 'success');
        if ('Notification' in window && Notification.permission === 'granted' && localStorage.getItem('upt-push') === '1') {
          navigator.serviceWorker?.ready.then((r) => r.showNotification(n.title, { body: n.body, icon: '/icon-192.png' })).catch(() => {});
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, isAdmin, qc, toast]);
}
