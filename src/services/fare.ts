import type { BookingDraft, FareBreakdown, FareConfig, StatePermit } from '../types';

// Client-side estimate only. The authoritative fare is recalculated in Postgres (create_booking).
// All rates come from the fare_configurations table, never from constants here.
// There is no luggage charge, service charge or GST. Toll tax is NOT estimated: it is billed at actuals after the trip.

// Distance is worked out first, leg by leg along the road, then priced at the per-km rate.
export const routePoints = (d: Pick<BookingDraft, 'trip_type' | 'pickup' | 'dropoff' | 'stops'>) =>
  d.trip_type === 'round_trip' ? [d.pickup, d.dropoff, d.pickup] : d.trip_type === 'multi_city' ? [d.pickup, ...d.stops, d.dropoff] : [d.pickup, d.dropoff];
export const sumLegs = (legs: number[]) => Math.round(legs.reduce((a, b) => a + b, 0) * 10) / 10;

export const calculateDistanceFare = (c: FareConfig, distanceKm: number) => Math.round(distanceKm * c.per_km_rate * 100) / 100;

// A state's tax for this trip, according to how that state charges it (per trip, per day, or per 7/30-day period).
export const permitCharge = (p: Pick<StatePermit, 'fee' | 'basis'>, days: number) => {
  const d = Math.max(1, days);
  const units = p.basis === 'per_day' ? d : p.basis === 'per_7_days' ? Math.ceil(d / 7) : p.basis === 'per_30_days' ? Math.ceil(d / 30) : 1;
  return Number(p.fee) * units;
};
export const PERMIT_BASIS_LABEL: Record<StatePermit['basis'], string> = { per_trip: 'per trip', per_day: 'per day', per_7_days: 'per 7 days', per_30_days: 'per 30 days' };

export const calculatePermitCharge = (permits: StatePermit[], selected: string[], days: number) =>
  permits.filter((p) => p.active && selected.includes(p.state)).reduce((s, p) => s + permitCharge(p, days), 0);

// Nights of a trip = days - 1. Night bata applies to every night, whether the vehicle is driven or halted overnight.
export const nightsOf = (days: number) => Math.max(0, days - 1);

export const calculateDayBata = (c: FareConfig, days: number) => c.day_bata_per_day * days;
export const calculateNightBata = (c: FareConfig, days: number) => c.night_bata_per_night * nightsOf(days);

export const calculateTotal = (f: Omit<FareBreakdown, 'total'>) => f.baseFare + f.permitCharge + f.dayBata + f.nightBata + f.toll;

export function calculateFare(c: FareConfig, permits: StatePermit[], d: BookingDraft, days: number): FareBreakdown {
  const parts = {
    baseFare: calculateDistanceFare(c, d.distance_km),
    permitCharge: calculatePermitCharge(permits, d.states, days),
    dayBata: calculateDayBata(c, days),
    nightBata: calculateNightBata(c, days),
    toll: 0,
  };
  return { ...parts, total: calculateTotal(parts) };
}
