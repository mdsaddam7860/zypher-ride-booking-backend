export type Role = "rider" | "driver" | "owner";

export type DriverStatus = "available" | "busy" | "offline";

export type RideStatus =
  | "pending_assignment"
  | "driver_assigned"
  | "driver_accepted"
  | "in_progress"
  | "completed"
  | "cancelled";

export type VehicleType = "4_seater" | "7_seater";

export type RidePaymentMethod = "cash" | "advance";

export type RidePaymentStatus =
  | "not_required"
  | "pending"
  | "paid"
  | "refunded"
  | "partially_refunded"
  | "failed";

export type PaymentStatus = "created" | "paid" | "failed" | "refunded" | "partially_refunded";

export type RideBookingType = "now" | "scheduled";

export type DispatchRequestStatus = "offered" | "accepted" | "declined" | "expired" | "superseded";

export interface JwtPayload {
  userId: string;
  role: Role;
}

// --- Row shapes as they exist in Postgres (snake_case) ---

export interface RiderRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  password_hash: string;
  ride_otp: string;
  created_at: Date;
}

export interface DriverRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  password_hash: string;
  status: DriverStatus;
  profile_photo_url: string | null;
  is_active: boolean;
  created_at: Date;
}

export interface DriverDocumentsRow {
  id: string;
  driver_id: string;
  aadhar_number: string | null;
  aadhar_photo_url: string | null;
  license_number: string | null;
  license_expiry: Date | null;
  license_photo_url: string | null;
  vehicle_registration_number: string | null;
  vehicle_model: string | null;
  vehicle_photo_url: string | null;
  is_verified: boolean;
  verified_by: string | null;
  verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface OwnerRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

// Postgres numeric/decimal columns come back as strings when read, but knex
// also accepts plain numbers on insert/update — this type covers both.
export type Numeric = string | number;

export interface DriverLocationRow {
  driver_id: string;
  lat: Numeric;
  lng: Numeric;
  updated_at: Date;
}

export interface FareRow {
  id: string;
  rider_id: string | null;
  pickup_lat: Numeric;
  pickup_lng: Numeric;
  pickup_address: string | null;
  dropoff_lat: Numeric;
  dropoff_lng: Numeric;
  dropoff_address: string | null;
  distance_meters: number;
  duration_seconds: number;
  estimated_price: Numeric;
  currency: string;
  vehicle_type: VehicleType;
  created_at: Date;
  expires_at: Date;
}

export interface RideRow {
  id: string;
  rider_id: string;
  driver_id: string | null;
  fare_id: string;
  status: RideStatus;
  pickup_lat: Numeric;
  pickup_lng: Numeric;
  dropoff_lat: Numeric;
  dropoff_lng: Numeric;
  cancel_reason: string | null;
  cancelled_by: "rider" | "driver" | "owner" | null;
  assigned_at: Date | null;
  accepted_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;

  vehicle_type: VehicleType;
  notes: string | null;
  scheduled_start_at: Date;
  scheduled_end_at: Date;
  distance_meters: number;
  is_long_distance: boolean;
  payment_method: RidePaymentMethod;
  payment_status: RidePaymentStatus;
  refund_amount: Numeric | null;
  arrived_at: Date | null;
  booking_type: RideBookingType;
  auto_dispatch_exhausted: boolean;
}

export interface RideDispatchRequestRow {
  id: string;
  ride_id: string;
  driver_id: string;
  status: DispatchRequestStatus;
  distance_meters: number;
  sequence: number;
  offered_at: Date;
  expires_at: Date;
  responded_at: Date | null;
  created_at: Date;
}

export interface RideAuditLogRow {
  id: string;
  ride_id: string;
  actor_id: string;
  actor_role: Role;
  action: string;
  changes: Record<string, unknown>;
  created_at: Date;
}

export interface PaymentRow {
  id: string;
  ride_id: string;
  rider_id: string;
  amount: Numeric;
  currency: string;
  status: PaymentStatus;
  provider_ref: string;
  refund_amount: Numeric | null;
  created_at: Date;
  updated_at: Date;
}

export interface NotificationRow {
  id: string;
  recipient_id: string;
  recipient_role: Role;
  ride_id: string | null;
  title: string;
  body: string;
  read: boolean;
  created_at: Date;
}

export interface LatLng {
  lat: number;
  lng: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
