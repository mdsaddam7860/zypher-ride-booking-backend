import { db } from "../db/connection";
import { config } from "../config";
import { DriverRow, FareRow, RideBookingType, RideRow, RideStatus, Role, VehicleType } from "../types";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";
import { notificationService } from "./notification.service";
import { auditService } from "./audit.service";
import { paymentService } from "./payment.service";
import { dispatchService } from "./dispatch.service";
import { driverService } from "./driver.service";
import { calculateRefundAmount } from "../utils/cancellation";
import { isLongDistance } from "../utils/pricing";
import { haversineDistanceMeters } from "../utils/geoutils";
import { logger } from "../utils/logger";

// Cancellable at any stage except once the ride is done — rider, assigned
// driver, or owner can all cancel up through in_progress.
export const ride_service_cancellable_statuses: RideStatus[] = [
  "pending_assignment",
  "driver_assigned",
  "driver_accepted",
  "in_progress",
];

// A rider may only have one ride in flight at a time.
const ACTIVE_RIDE_STATUSES: RideStatus[] = [
  "pending_assignment",
  "driver_assigned",
  "driver_accepted",
  "in_progress",
];

// Statuses that count as "assigned" for the driver double-booking check.
const DRIVER_LOCKING_STATUSES: RideStatus[] = ["driver_assigned", "driver_accepted", "in_progress"];

// Ride ordering for the owner dashboard: in-progress work first, then rides
// awaiting action, then everything else, newest first within each bucket.
const OWNER_STATUS_SORT_ORDER: Record<RideStatus, number> = {
  in_progress: 0,
  driver_accepted: 1,
  driver_assigned: 2,
  pending_assignment: 3,
  completed: 4,
  cancelled: 5,
};

export interface RequestRideInput {
  riderId: string;
  fareId: string;
  scheduledStartAt: Date;
  paymentMethod: "cash" | "advance";
  notes?: string;
  bookingType: RideBookingType;
}

export interface EditRideInput {
  pickup?: { lat: number; lng: number };
  dropoff?: { lat: number; lng: number };
  vehicleType?: VehicleType;
  notes?: string;
}

// NOTE ON TRANSACTIONS + NOTIFICATIONS:
// notificationService writes to the `notifications` table (and, via ride_id,
// has a FK back to `rides`) using the plain `db` connection — never the `trx`
// of the ride operation it's reporting on. If it ran *inside* the ride's
// transaction, other connections (and the notification insert itself, since
// it's on a separate connection) wouldn't yet see the not-committed ride row,
// which trips the ride_id foreign key. So every notification call below is
// deliberately issued *after* `db.transaction(...)` has resolved (i.e. after
// commit), not from within the callback.

export const rideService = {
  async requestRide(input: RequestRideInput): Promise<RideRow> {
    const ride = await db.transaction(async (trx) => {
      const fare = await trx<FareRow>("fares").where({ id: input.fareId }).first();
      if (!fare) throw new NotFoundError("Fare not found");
      if (fare.rider_id && fare.rider_id !== input.riderId) {
        throw new ForbiddenError("This fare estimate belongs to a different rider");
      }
      if (new Date(fare.expires_at).getTime() < Date.now()) {
        throw new BadRequestError("Fare estimate has expired, request a new one");
      }
      if (input.scheduledStartAt.getTime() < Date.now() - 60 * 1000) {
        throw new BadRequestError("scheduledStartAt must be in the future");
      }

      // One active ride per rider, enforced at request time (row lock avoids races).
      const existingActive = await trx<RideRow>("rides")
        .where({ rider_id: input.riderId })
        .whereIn("status", ACTIVE_RIDE_STATUSES)
        .forUpdate()
        .first();
      if (existingActive) {
        throw new ConflictError("You already have an active ride in progress");
      }

      const durationMs = fare.duration_seconds * 1000;
      const scheduledEndAt = new Date(input.scheduledStartAt.getTime() + durationMs);
      const longDistance = isLongDistance(fare.distance_meters);

      const [newRide] = await trx<RideRow>("rides")
        .insert({
          rider_id: input.riderId,
          fare_id: fare.id,
          status: "pending_assignment",
          pickup_lat: fare.pickup_lat,
          pickup_lng: fare.pickup_lng,
          dropoff_lat: fare.dropoff_lat,
          dropoff_lng: fare.dropoff_lng,
          vehicle_type: fare.vehicle_type,
          notes: input.notes ?? null,
          scheduled_start_at: input.scheduledStartAt,
          scheduled_end_at: scheduledEndAt,
          distance_meters: fare.distance_meters,
          is_long_distance: longDistance,
          payment_method: input.paymentMethod,
          payment_status: input.paymentMethod === "advance" ? "pending" : "not_required",
          booking_type: input.bookingType,
        })
        .returning("*");

      if (input.paymentMethod === "advance") {
        await paymentService.createOrder(newRide, input.riderId, Number(fare.estimated_price), fare.currency, trx);
      }

      await auditService.log(newRide.id, { userId: input.riderId, role: "rider" }, "ride_requested", {
        fareId: fare.id,
        vehicleType: fare.vehicle_type,
        scheduledStartAt: input.scheduledStartAt,
        paymentMethod: input.paymentMethod,
        bookingType: input.bookingType,
      }, trx);

      return newRide;
    });

    await notificationService.notifyOwnerNewPendingRide(ride.id);

    // "now" bookings kick off auto-dispatch to nearby drivers immediately;
    // "scheduled" bookings are left in pending_assignment for the owner to
    // assign manually later (driver location isn't predictive far ahead of
    // departure). Dispatch failures shouldn't fail ride creation — the ride
    // still exists and falls back to the owner's manual queue either way.
    if (ride.booking_type === "now") {
      dispatchService.startDispatch(ride.id).catch((err) => {
        logger.error("Auto-dispatch failed to start", { rideId: ride.id, error: String(err) });
      });
    }

    return ride;
  },

  async getById(rideId: string): Promise<RideRow> {
    const ride = await db<RideRow>("rides").where({ id: rideId }).first();
    if (!ride) throw new NotFoundError("Ride not found");
    return ride;
  },

  async assertViewable(ride: RideRow, userId: string, role: string): Promise<void> {
    if (role === "owner") return;
    if (role === "rider" && ride.rider_id === userId) return;
    if (role === "driver" && ride.driver_id === userId) return;
    throw new ForbiddenError("You do not have access to this ride");
  },

  /**
   * Owner-only edit of pickup/dropoff/vehicle_type/notes. Only allowed while
   * the ride is unassigned (pending_assignment). Every change is written to
   * the ride_audit_log. Note: the owner can only ever *edit* an existing
   * ride — there is no owner-facing "create ride" endpoint.
   */
  async ownerEditRide(rideId: string, ownerId: string, updates: EditRideInput): Promise<RideRow> {
    let riderId: string | null = null;

    const updatedRide = await db.transaction(async (trx) => {
      const ride = await trx<RideRow>("rides").where({ id: rideId }).forUpdate().first();
      if (!ride) throw new NotFoundError("Ride not found");
      if (ride.status !== "pending_assignment") {
        throw new ConflictError("Ride can only be edited while it is unassigned");
      }

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const patch: Partial<RideRow> = {};

      if (updates.pickup) {
        changes.pickup = {
          from: { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) },
          to: updates.pickup,
        };
        patch.pickup_lat = updates.pickup.lat;
        patch.pickup_lng = updates.pickup.lng;
      }
      if (updates.dropoff) {
        changes.dropoff = {
          from: { lat: Number(ride.dropoff_lat), lng: Number(ride.dropoff_lng) },
          to: updates.dropoff,
        };
        patch.dropoff_lat = updates.dropoff.lat;
        patch.dropoff_lng = updates.dropoff.lng;
      }
      if (updates.vehicleType && updates.vehicleType !== ride.vehicle_type) {
        changes.vehicleType = { from: ride.vehicle_type, to: updates.vehicleType };
        patch.vehicle_type = updates.vehicleType;
      }
      if (updates.notes !== undefined && updates.notes !== ride.notes) {
        changes.notes = { from: ride.notes, to: updates.notes };
        patch.notes = updates.notes;
      }

      if (Object.keys(patch).length === 0) {
        return ride;
      }

      const [result] = await trx<RideRow>("rides").where({ id: rideId }).update(patch).returning("*");

      await auditService.log(rideId, { userId: ownerId, role: "owner" }, "ride_edited", changes, trx);
      riderId = ride.rider_id;

      return result;
    });

    if (riderId) {
      await notificationService.notifyRiderRideUpdated(riderId, rideId, "updated by dispatcher");
    }

    return updatedRide;
  },

  /**
   * Owner assigns a driver to a pending ride. Owners may assign several
   * rides to the same driver as long as their scheduled time windows don't
   * overlap — validated via the ride's scheduled_start_at/scheduled_end_at
   * against the driver's other currently-assigned rides. Row-level locking
   * (SELECT ... FOR UPDATE) prevents two concurrent assignments from
   * double-booking the same ride or creating a race on the overlap check.
   */
  async assignDriver(rideId: string, driverId: string, actorId: string): Promise<RideRow> {
    const updatedRide = await db.transaction(async (trx) => {
      const ride = await trx<RideRow>("rides").where({ id: rideId }).forUpdate().first();
      if (!ride) throw new NotFoundError("Ride not found");
      if (ride.status !== "pending_assignment") {
        throw new ConflictError(`Ride is not pending assignment (current status: ${ride.status})`);
      }

      const driver = await trx<DriverRow>("drivers").where({ id: driverId }).forUpdate().first();
      if (!driver) throw new NotFoundError("Driver not found");
      if (driver.status === "offline") {
        throw new ConflictError("Driver is offline");
      }
      if (!driver.is_active) {
        throw new ConflictError("Driver's documents are not verified — cannot be assigned rides");
      }

      const overlapping = await trx<RideRow>("rides")
        .where({ driver_id: driverId })
        .whereIn("status", DRIVER_LOCKING_STATUSES)
        .andWhere("scheduled_start_at", "<", ride.scheduled_end_at)
        .andWhere("scheduled_end_at", ">", ride.scheduled_start_at)
        .first();
      if (overlapping) {
        throw new ConflictError("Driver already has a ride scheduled in that time window");
      }

      const [result] = await trx<RideRow>("rides")
        .where({ id: rideId })
        .update({ driver_id: driverId, status: "driver_assigned", assigned_at: new Date() })
        .returning("*");

      await auditService.log(rideId, { userId: actorId, role: "owner" }, "driver_assigned", { driverId }, trx);
      return result;
    });

    await notificationService.notifyDriverAssigned(driverId, rideId);
    return updatedRide;
  },

  async respondToAssignment(
    rideId: string,
    driverId: string,
    action: "accept" | "deny"
  ): Promise<RideRow> {
    let riderId = "";

    const updatedRide = await db.transaction(async (trx) => {
      const ride = await trx<RideRow>("rides").where({ id: rideId }).forUpdate().first();
      if (!ride) throw new NotFoundError("Ride not found");
      if (ride.driver_id !== driverId) {
        throw new ForbiddenError("This ride is not assigned to you");
      }
      if (ride.status !== "driver_assigned") {
        throw new ConflictError(`Ride is not awaiting driver response (current status: ${ride.status})`);
      }

      riderId = ride.rider_id;
      let result: RideRow;

      if (action === "accept") {
        const driver = await trx<DriverRow>("drivers").where({ id: driverId }).first();
        if (!driver?.is_active) {
          throw new ConflictError("Your documents are not verified — you cannot accept rides");
        }

        [result] = await trx<RideRow>("rides")
          .where({ id: rideId })
          .update({ status: "driver_accepted", accepted_at: new Date() })
          .returning("*");
      } else {
        [result] = await trx<RideRow>("rides")
          .where({ id: rideId })
          .update({ driver_id: null, status: "pending_assignment", assigned_at: null })
          .returning("*");
      }

      await auditService.log(rideId, { userId: driverId, role: "driver" }, `driver_${action}`, {}, trx);
      return result;
    });

    await notificationService.notifyOwnerDriverResponded(rideId, action === "accept");
    await notificationService.notifyRiderRideUpdated(riderId, rideId, updatedRide.status);
    return updatedRide;
  },

  /**
   * Driver marks themselves as having reached the pickup point. Allowed once
   * accepted, before the ride starts — and only when their last known
   * location is actually within `config.geofence.arrivalRadiusMeters` of the
   * pickup point (server-enforced, not just a UI affordance).
   */
  async markArrived(rideId: string, driverId: string): Promise<RideRow> {
    let riderId = "";

    const updatedRide = await db.transaction(async (trx) => {
      const ride = await trx<RideRow>("rides").where({ id: rideId }).forUpdate().first();
      if (!ride) throw new NotFoundError("Ride not found");
      if (ride.driver_id !== driverId) throw new ForbiddenError("This ride is not assigned to you");
      if (ride.status !== "driver_accepted") {
        throw new ConflictError(`Ride cannot be marked arrived from status: ${ride.status}`);
      }

      const location = await driverService.getLastLocation(driverId);
      if (!location) throw new ConflictError("No known location for this driver — send a location update first");
      const distance = haversineDistanceMeters(location, {
        lat: Number(ride.pickup_lat),
        lng: Number(ride.pickup_lng),
      });
      if (distance > config.geofence.arrivalRadiusMeters) {
        throw new ConflictError(
          `You're too far from the pickup point to mark arrival (${Math.round(distance)}m away, need to be within ${config.geofence.arrivalRadiusMeters}m)`
        );
      }

      riderId = ride.rider_id;

      const [result] = await trx<RideRow>("rides")
        .where({ id: rideId })
        .update({ arrived_at: new Date() })
        .returning("*");

      await auditService.log(rideId, { userId: driverId, role: "driver" }, "driver_arrived", { distanceMeters: Math.round(distance) }, trx);
      return result;
    });

    await notificationService.notifyRiderDriverArrived(riderId, rideId);
    return updatedRide;
  },

  /**
   * Auto-arrival check — called from the driver's location-update endpoint.
   * If the driver has a `driver_accepted` ride and is now within the
   * geofence radius of its pickup point, marks arrival automatically
   * (same effect as `markArrived`, just system-triggered). Silently no-ops
   * if there's no such ride or they're not close enough yet — this is meant
   * to be called on every location ping, not just when relevant.
   */
  async autoMarkArrivedIfNear(driverId: string, location: { lat: number; lng: number }): Promise<void> {
    const ride = await db<RideRow>("rides")
      .where({ driver_id: driverId, status: "driver_accepted" })
      .whereNull("arrived_at")
      .first();
    if (!ride) return;

    const distance = haversineDistanceMeters(location, {
      lat: Number(ride.pickup_lat),
      lng: Number(ride.pickup_lng),
    });
    if (distance > config.geofence.arrivalRadiusMeters) return;

    try {
      await this.markArrived(ride.id, driverId);
    } catch (err) {
      // Best-effort — a race with a manual markArrived call (or a status
      // change in between) shouldn't blow up the location-update request.
      logger.warn("Auto-arrival check failed", { rideId: ride.id, driverId, error: String(err) });
    }
  },

  /**
   * Driver starts the ride — requires the rider's permanent 4-digit OTP
   * (told to the driver in person). This is the only gate on `start`; there
   * is no separate "must have arrived first" requirement, since arrival is
   * just a notification step, not a hard precondition.
   */
  async startRide(rideId: string, driverId: string, otp: string): Promise<RideRow> {
    let riderId = "";

    const updatedRide = await db.transaction(async (trx) => {
      const ride = await trx<RideRow>("rides").where({ id: rideId }).forUpdate().first();
      if (!ride) throw new NotFoundError("Ride not found");
      if (ride.driver_id !== driverId) throw new ForbiddenError("This ride is not assigned to you");
      if (ride.status !== "driver_accepted") {
        throw new ConflictError(`Ride cannot be started from status: ${ride.status}`);
      }

      const rider = await trx<{ id: string; ride_otp: string }>("riders").where({ id: ride.rider_id }).first();
      if (!rider || rider.ride_otp !== otp) {
        throw new BadRequestError("Incorrect OTP");
      }

      riderId = ride.rider_id;

      const [result] = await trx<RideRow>("rides")
        .where({ id: rideId })
        .update({ status: "in_progress", started_at: new Date() })
        .returning("*");

      await auditService.log(rideId, { userId: driverId, role: "driver" }, "ride_started", {}, trx);
      return result;
    });

    await notificationService.notifyRiderRideUpdated(riderId, rideId, "in_progress");
    return updatedRide;
  },

  async completeRide(rideId: string, driverId: string): Promise<RideRow> {
    let riderId = "";

    const updatedRide = await db.transaction(async (trx) => {
      const ride = await trx<RideRow>("rides").where({ id: rideId }).forUpdate().first();
      if (!ride) throw new NotFoundError("Ride not found");
      if (ride.driver_id !== driverId) throw new ForbiddenError("This ride is not assigned to you");
      if (ride.status !== "in_progress") {
        throw new ConflictError(`Ride cannot be completed from status: ${ride.status}`);
      }

      riderId = ride.rider_id;

      // A ride currently has exactly one booking (the rider's own request),
      // so completing the ride completes that booking too. If bookings are
      // ever split out into their own table, mark them all completed here.
      const [result] = await trx<RideRow>("rides")
        .where({ id: rideId })
        .update({ status: "completed", completed_at: new Date() })
        .returning("*");

      if (ride.payment_method === "cash" && ride.payment_status === "not_required") {
        await trx<RideRow>("rides").where({ id: rideId }).update({ payment_status: "paid" });
      }

      await auditService.log(rideId, { userId: driverId, role: "driver" }, "ride_completed", {}, trx);
      return result;
    });

    await notificationService.notifyRiderRideUpdated(riderId, rideId, "completed");
    return updatedRide;
  },

  /**
   * Auto-completion check — called from the driver's location-update
   * endpoint. If the driver has an `in_progress` ride and is now within the
   * geofence radius of its dropoff point, completes the ride automatically
   * (same effect as `completeRide`, just system-triggered). Silently no-ops
   * otherwise — meant to be called on every location ping.
   */
  async autoCompleteIfNearDropoff(driverId: string, location: { lat: number; lng: number }): Promise<void> {
    const ride = await db<RideRow>("rides").where({ driver_id: driverId, status: "in_progress" }).first();
    if (!ride) return;

    const distance = haversineDistanceMeters(location, {
      lat: Number(ride.dropoff_lat),
      lng: Number(ride.dropoff_lng),
    });
    if (distance > config.geofence.completionRadiusMeters) return;

    try {
      await this.completeRide(ride.id, driverId);
    } catch (err) {
      logger.warn("Auto-completion check failed", { rideId: ride.id, driverId, error: String(err) });
    }
  },

  async cancelRide(
    rideId: string,
    requester: { userId: string; role: "rider" | "driver" | "owner" },
    reason?: string
  ): Promise<RideRow> {
    let riderId = "";
    let driverId: string | null = null;

    const updatedRide = await db.transaction(async (trx) => {
      const ride = await trx<RideRow>("rides").where({ id: rideId }).forUpdate().first();
      if (!ride) throw new NotFoundError("Ride not found");

      if (requester.role === "rider" && ride.rider_id !== requester.userId) {
        throw new ForbiddenError("This is not your ride");
      }
      if (requester.role === "driver" && ride.driver_id !== requester.userId) {
        throw new ForbiddenError("This ride is not assigned to you");
      }
      if (!ride_service_cancellable_statuses.includes(ride.status)) {
        throw new ConflictError(`Ride cannot be cancelled from status: ${ride.status}`);
      }

      riderId = ride.rider_id;
      driverId = ride.driver_id;

      let refundAmount: number | null = null;
      let refundPercent: number | null = null;

      if (ride.payment_method === "advance" && ride.payment_status === "paid") {
        const fare = await trx<FareRow>("fares").where({ id: ride.fare_id }).first();
        const paidAmount = fare ? Number(fare.estimated_price) : 0;
        const result = calculateRefundAmount(paidAmount, new Date(), new Date(ride.scheduled_start_at));
        refundAmount = result.amount;
        refundPercent = result.percent;
        await paymentService.refund(rideId, result.percent, result.amount, trx);
      }

      const [result] = await trx<RideRow>("rides")
        .where({ id: rideId })
        .update({
          status: "cancelled",
          cancelled_at: new Date(),
          cancel_reason: reason ?? null,
          cancelled_by: requester.role,
          refund_amount: refundAmount,
          payment_status:
            refundAmount === null
              ? ride.payment_status
              : refundPercent === 100
                ? "refunded"
                : refundPercent === 0
                  ? ride.payment_status
                  : "partially_refunded",
        })
        .returning("*");

      await auditService.log(
        rideId,
        requester,
        "ride_cancelled",
        { reason: reason ?? null, refundAmount, refundPercent },
        trx
      );

      return result;
    });

    await notificationService.notifyRiderRideUpdated(riderId, rideId, "cancelled");
    if (driverId) {
      await notificationService.notifyStatusChange(driverId, "driver", rideId, "cancelled");
    }
    return updatedRide;
  },

  /** All rides for the caller — rider/driver: their own; owner: everyone's — newest first. */
  async listHistory(userId: string, role: Role, statusFilter?: RideStatus): Promise<RideRow[]> {
    const query = db<RideRow>("rides");
    if (role === "rider") query.where({ rider_id: userId });
    else if (role === "driver") query.where({ driver_id: userId });
    // owner sees every ride
    if (statusFilter) query.andWhere({ status: statusFilter });
    return query.orderBy("created_at", "desc");
  },

  /** Owner view of every ride (in-progress, pending, completed, ...), sorted by urgency then recency. */
  async listAllForOwner(statusFilter?: RideStatus): Promise<RideRow[]> {
    const query = db<RideRow>("rides");
    if (statusFilter) query.where({ status: statusFilter });
    const rides = await query.select("*");
    return rides.sort((a, b) => {
      const order = OWNER_STATUS_SORT_ORDER[a.status] - OWNER_STATUS_SORT_ORDER[b.status];
      if (order !== 0) return order;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  },
};