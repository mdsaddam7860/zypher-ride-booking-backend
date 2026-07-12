import { FareRow, RideRow, Role } from "../types";

/**
 * Serializes a ride for API responses.
 *
 * Billing info restricted to the rider: `viewerRole` gates the detailed
 * billing block (payment method/status/refund). Owner and driver can still
 * see the fare amount itself via `fare`, just not the billing details.
 *
 * Contact info (phone numbers) is only ever included by the caller once a
 * driver is assigned — see ride.controller.ts's `buildContact` helper, which
 * decides when it's appropriate to reveal numbers and passes them in here.
 */
export function serializeRide(
  ride: RideRow,
  opts?: {
    fare?: FareRow;
    viewerRole?: Role;
    contact?: { riderPhone?: string; driverPhone?: string };
  }
) {
  const base = {
    rideId: ride.id,
    riderId: ride.rider_id,
    driverId: ride.driver_id,
    fareId: ride.fare_id,
    status: ride.status,
    vehicleType: ride.vehicle_type,
    notes: ride.notes,
    pickup: { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) },
    dropoff: { lat: Number(ride.dropoff_lat), lng: Number(ride.dropoff_lng) },
    scheduledStartAt: ride.scheduled_start_at,
    scheduledEndAt: ride.scheduled_end_at,
    distanceMeters: ride.distance_meters,
    isLongDistance: ride.is_long_distance,
    cancelReason: ride.cancel_reason,
    cancelledBy: ride.cancelled_by,
    assignedAt: ride.assigned_at,
    acceptedAt: ride.accepted_at,
    startedAt: ride.started_at,
    completedAt: ride.completed_at,
    cancelledAt: ride.cancelled_at,
    arrivedAt: ride.arrived_at,
    bookingType: ride.booking_type,
    autoDispatchExhausted: ride.auto_dispatch_exhausted,
    createdAt: ride.created_at,
  };

  const fareAmount = opts?.fare
    ? { estimatedPrice: Number(opts.fare.estimated_price), currency: opts.fare.currency }
    : undefined;

  // Owner and driver can see the fare amount, but not the billing/payment
  // breakdown. Only the rider (and the owner, for dispute handling) sees that.
  const canSeeBilling = opts?.viewerRole === "rider" || opts?.viewerRole === "owner";

  return {
    ...base,
    fare: fareAmount,
    contact: opts?.contact,
    billing: canSeeBilling
      ? {
        paymentMethod: ride.payment_method,
        paymentStatus: ride.payment_status,
        refundAmount: ride.refund_amount === null ? null : Number(ride.refund_amount),
      }
      : undefined,
  };
}