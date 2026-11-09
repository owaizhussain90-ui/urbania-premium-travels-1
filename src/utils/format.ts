import { format, parseISO } from 'date-fns';

export const inr = (n: number | string | null | undefined) =>
  '₹' + Math.round(Number(n ?? 0)).toLocaleString('en-IN');

export const fmtDate = (d: string) => format(parseISO(d), 'dd MMM yyyy');
export const fmtDateTime = (d: string) => format(parseISO(d), 'dd MMM, hh:mm a');

// The van is registered here, so this state never carries an extra permit tax.
export const HOME_STATE = 'Karnataka';
// Union territories are not states, so no state permit tax is charged or flagged for them.
export const UNION_TERRITORIES = ['Puducherry', 'Delhi', 'Chandigarh', 'Ladakh', 'Jammu and Kashmir', 'Andaman and Nicobar Islands', 'Lakshadweep', 'Dadra and Nagar Haveli and Daman and Diu'];
export const OPERATOR_PHONE = import.meta.env.VITE_OPERATOR_PHONE || '+919999999999';
export const OPERATOR_WHATSAPP = import.meta.env.VITE_OPERATOR_WHATSAPP || '919999999999';

export const tripLabel = (t?: string) => ({ round_trip: 'Round trip', multi_city: 'Multi-city' } as Record<string, string>)[t ?? ''] ?? 'One way';

export const toE164 = (p: string) => '+91' + p.replace(/\D/g, '').slice(-10);

export const sanitize = (s: string) => s.replace(/[<>]/g, '').trim();

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
