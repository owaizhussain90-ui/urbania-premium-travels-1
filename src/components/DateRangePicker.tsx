import { useMemo, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, parseISO, startOfMonth } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cx } from './ui';

// One van, one trip at a time: a day that anyone has booked (or is waiting for approval) cannot be picked.
// The picker never says who booked it, only that the day is unavailable.
const iso = (d: Date) => format(d, 'yyyy-MM-dd');

export function DateRangePicker({ start, end, unavailable, onChange, error }: {
  start: string; end: string; unavailable: ReadonlySet<string>; onChange: (s: string, e: string) => void; error?: string;
}) {
  const todayIso = iso(new Date());
  const [month, setMonth] = useState(() => startOfMonth(start ? parseISO(start) : new Date()));
  const [note, setNote] = useState('');
  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);
  const lead = getDay(startOfMonth(month)); // Sunday-first
  const blocked = (d: string) => d < todayIso || unavailable.has(d);
  const crossesBooked = (a: string, b: string) => eachDayOfInterval({ start: parseISO(a), end: parseISO(b) }).some((x) => unavailable.has(iso(x)));

  const pick = (d: string) => {
    if (blocked(d)) return;
    setNote('');
    if (!start || end || d < start) { onChange(d, ''); return; }
    if (crossesBooked(start, d)) { setNote('Some days in that range are already booked. Pick dates that are all free.'); onChange(d, ''); return; }
    onChange(start, d);
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3" role="group" aria-label="Select trip dates">
      <div className="flex items-center justify-between mb-2">
        <button type="button" aria-label="Previous month" disabled={startOfMonth(month) <= startOfMonth(new Date())} onClick={() => setMonth(addMonths(month, -1))} className="w-11 h-11 grid place-items-center rounded-full disabled:opacity-30"><ChevronLeft size={18} /></button>
        <p className="font-heading font-semibold text-navy">{format(month, 'MMMM yyyy')}</p>
        <button type="button" aria-label="Next month" disabled={month >= addMonths(startOfMonth(new Date()), 12)} onClick={() => setMonth(addMonths(month, 1))} className="w-11 h-11 grid place-items-center rounded-full disabled:opacity-30"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-muted mb-1">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((c, i) => <span key={i}>{c}</span>)}</div>
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: lead }).map((_, i) => <span key={`b${i}`} />)}
        {days.map((day) => {
          const d = iso(day);
          const off = blocked(d);
          const booked = unavailable.has(d);
          const isStart = d === start, isEnd = d === end;
          const inRange = !!start && !!end && d > start && d < end;
          return (
            <button key={d} type="button" disabled={off} onClick={() => pick(d)} aria-pressed={isStart || isEnd}
              aria-label={`${format(day, 'd MMMM yyyy')}${booked ? ', unavailable' : ''}`}
              className={cx('h-11 text-sm grid place-items-center relative',
                isStart || isEnd ? 'bg-navy text-white rounded-full font-semibold z-10' : inRange ? 'bg-amber/25' : 'rounded-full',
                off && 'text-gray-300', booked && 'line-through bg-gray-100 text-gray-400', !off && !isStart && !isEnd && !inRange && 'hover:bg-gray-100')}>
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-muted">
        <span className="flex items-center gap-1"><i className="w-3 h-3 rounded-full bg-navy inline-block" />Selected</span>
        <span className="flex items-center gap-1"><i className="w-3 h-3 rounded bg-gray-100 inline-block" /><s>12</s> Unavailable</span>
      </div>
      {(note || error) && <p role="alert" className="text-sm text-danger mt-2">{note || error}</p>}
    </div>
  );
}
