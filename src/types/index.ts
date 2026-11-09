export interface FareConfig {
  per_km_rate: number;
  day_bata_per_day: number;
  night_bata_per_night: number;
}

// How a state charges its tourist-vehicle tax: once per trip, per day, or per 7 / 30 day period.
export type PermitBasis = 'per_trip' | 'per_day' | 'per_7_days' | 'per_30_days';

export interface StatePermit {
  state: string;
  fee: number;
  basis: PermitBasis;
  verified: boolean; // false until the owner has confirmed the rate against the state's current notification / a receipt
  active: boolean;
}

export type TripType = 'one_way' | 'round_trip' | 'multi_city';

export type BookingStatus = 'pending' | 'approved' | 'rejected';

export interface Booking {
  id: string;
  booking_reference: string;
  user_id: string;
  customer_name: string;
  phone: string;
  email: string | null;
  pickup: string;
  dropoff: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  special_requests: string | null;
  distance_km: number;
  trip_type: TripType;
  billed_km: number;
  verified_km: number | null;
  verified_leg_km: number[] | null;
  verified_states: string[] | null;
  distance_check: 'pending' | 'verified' | 'mismatch' | 'unavailable';
  stops: string[];
  leg_km: number[];
  seat_count: number;
  small_bags: number;
  large_bags: number;
  oversized_items: number;
  base_fare: number;
  permit_charge: number;
  day_bata: number;
  night_bata: number;
  driver_bata: number;
  toll_tax: number; // actual toll, recorded by admin after the trip (0 until then)
  toll_recorded_at: string | null;
  total_estimate: number;
  final_total: number | null;
  status: BookingStatus;
  admin_note: string | null;
  admin_override: boolean;
  created_at: string;
  updated_at: string;
}

export interface BookingDetail extends Booking {
  booking_seats: { seat_no: number }[];
  booking_permits: { state: string; fee: number }[];
  booking_status_history: { id: number; status: string; note: string | null; created_at: string }[];
}

export interface AppNotification {
  id: string;
  booking_id: string | null;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

export interface BookingDraft {
  customer_name: string;
  phone: string;
  email: string;
  start_date: string;
  end_date: string;
  pickup: string;
  dropoff: string;
  special_requests: string;
  distance_km: number;
  trip_type: TripType;
  stops: string[];
  leg_km: number[];
  route_sig: string;
  states_sig: string;
  route_states: string[]; // every state the route passes through, as detected from Google Maps
  seats: number[];
  small_bags: number;
  large_bags: number;
  oversized_items: number;
  states: string[];
}

export interface FareBreakdown {
  baseFare: number;
  permitCharge: number;
  dayBata: number;
  nightBata: number;
  toll: number; // actual toll once recorded; 0 in an estimate
  total: number;
}
