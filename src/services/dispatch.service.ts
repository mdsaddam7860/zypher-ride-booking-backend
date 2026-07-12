import { db } from "../db/connection";
import { config } from "../config";
import { driverService } from "./driver.service";
import { notificationService } from "./notification.service";
import { auditService } from "./audit.service";
import { offerTimeoutStore } from "../realtime/offerTimeoutStore";
import { emitToDriver, emitToOwners, emitToRider, emitToRideWatchers } from "../realtime/socket";
import { RideDispatchRequestRow, RideRow } from "../types";
import { ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";

// Dispatch-originated DB writes (audit log entries, dispatch requests) need
// an "actor" — there's no real user driving these, so we use a stable
// system placeholder, same pattern as notification.service.ts's
// "owner-dashboard" broadcast marker.
// Dispatch-originated DB writes (audit log entries) need an "actor", but
// there's no real user driving these. ride_audit_log.actor_id is a `uuid`
// column, so unlike notification.service.ts's "owner-dashboard" string
// placeholder, we need an actual valid UUID here — the nil UUID is a
// widely-used convention for "no real user, system-generated."
const SYSTEM_ACTOR = { userId: "00000000-0000-0000-0000-000000000000", role: "owner" as const };

/**
 * Finds the next untried nearby available driver for a ride and creates a
 * fresh "offered" dispatch request for them, notifies + sockets them, and
 * schedules the offer's timeout. If no more drivers are available (radius
 * exhausted or maxDriversToTry reached), marks the ride
 * `auto_dispatch_exhausted` and notifies the owner to assign manually.
 *
 * Safe to call repeatedly (on decline/expire) — it always re-checks the
 * ride's current status first and no-ops if it's no longer
 * `pending_assignment` (e.g. cancelled, or already assigned some other way).
 */
async function tryNextDriver(rideId: string): Promise<void> {
  const result = await db.transaction(async (trx) => {
    const ride = await trx<RideRow>("rides").where({ id: rideId }).forUpdate().first();
    if (!ride || ride.status !== "pending_assignment" || ride.driver_id) {
      return null;
    }

    const triedDriverIds = await trx<RideDispatchRequestRow>("ride_dispatch_requests")
      .where({ ride_id: rideId })
      .pluck("driver_id");

    if (triedDriverIds.length >= config.dispatch.maxDriversToTry) {
      await trx<RideRow>("rides").where({ id: rideId }).update({ auto_dispatch_exhausted: true });
      await auditService.log(
        rideId,
        SYSTEM_ACTOR,
        "auto_dispatch_exhausted",
        { reason: "max_drivers_reached", attempted: triedDriverIds.length },
        trx
      );
      return { exhausted: true as const };
    }

    // Pull a candidate pool bigger than maxDriversToTry so we have headroom
    // to skip drivers we've already offered to (declined/expired/etc).
    const pool = await driverService.findNearestAvailable(
      { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) },
      { radiusMeters: config.dispatch.searchRadiusMeters, limit: config.dispatch.maxDriversToTry * 4 }
    );
    const next = pool.find((d) => !triedDriverIds.includes(d.id));

    if (!next) {
      await trx<RideRow>("rides").where({ id: rideId }).update({ auto_dispatch_exhausted: true });
      await auditService.log(
        rideId,
        SYSTEM_ACTOR,
        "auto_dispatch_exhausted",
        { reason: "no_drivers_in_radius", attempted: triedDriverIds.length },
        trx
      );
      return { exhausted: true as const };
    }

    const expiresAt = new Date(Date.now() + config.dispatch.offerTimeoutSeconds * 1000);
    const [offer] = await trx<RideDispatchRequestRow>("ride_dispatch_requests")
      .insert({
        ride_id: rideId,
        driver_id: next.id,
        sequence: triedDriverIds.length,
        distance_meters: next.distanceMeters,
        status: "offered",
        expires_at: expiresAt,
      })
      .returning("*");

    await auditService.log(
      rideId,
      SYSTEM_ACTOR,
      "dispatch_offered",
      { driverId: next.id, sequence: offer.sequence, distanceMeters: next.distanceMeters },
      trx
    );

    return { exhausted: false as const, offer, ride };
  });

  if (!result) return;

  if (result.exhausted) {
    await notificationService.notifyOwnerAutoDispatchExhausted(rideId);
    emitToOwners("ride:dispatch:exhausted", { rideId });
    return;
  }

  const { offer, ride } = result;

  offerTimeoutStore.schedule(offer.id, config.dispatch.offerTimeoutSeconds * 1000, () => {
    handleOfferExpired(offer.id).catch((err) =>
      logger.error("Failed to handle dispatch offer expiry", { offerId: offer.id, error: String(err) })
    );
  });

  await notificationService.notifyDriverRideOffer(offer.driver_id, rideId);
  emitToDriver(offer.driver_id, "ride:offer", {
    offerId: offer.id,
    rideId,
    vehicleType: ride.vehicle_type,
    pickup: { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) },
    dropoff: { lat: Number(ride.dropoff_lat), lng: Number(ride.dropoff_lng) },
    distanceMeters: Number(offer.distance_meters),
    scheduledStartAt: ride.scheduled_start_at,
    expiresAt: offer.expires_at,
  });
}

async function handleOfferExpired(offerId: string): Promise<void> {
  const offer = await db.transaction(async (trx) => {
    const row = await trx<RideDispatchRequestRow>("ride_dispatch_requests")
      .where({ id: offerId, status: "offered" })
      .forUpdate()
      .first();
    if (!row) return null; // already responded to (accept/decline raced the timer) — no-op

    const [updated] = await trx<RideDispatchRequestRow>("ride_dispatch_requests")
      .where({ id: offerId })
      .update({ status: "expired", responded_at: new Date() })
      .returning("*");

    await auditService.log(row.ride_id, SYSTEM_ACTOR, "dispatch_expired", { offerId }, trx);
    return updated;
  });

  if (!offer) return;

  emitToDriver(offer.driver_id, "ride:offer:expired", { offerId, rideId: offer.ride_id });
  await tryNextDriver(offer.ride_id);
}

export const dispatchService = {
  /**
   * Entry point — call after a "now" ride is created (or whenever you want
   * to (re)start auto-dispatch for a pending_assignment ride, e.g. an owner
   * manually triggering it for a scheduled ride close to departure).
   */
  async startDispatch(rideId: string): Promise<void> {
    await tryNextDriver(rideId);
  },

  /**
   * Driver responds to an offer. Accept wins the ride (if it's still up for
   * grabs); decline (or a prior timeout) moves on to the next-nearest driver.
   */
  async respondToOffer(
    offerId: string,
    driverId: string,
    action: "accept" | "decline"
  ): Promise<RideRow | null> {
    const result = await db.transaction(async (trx) => {
      const offer = await trx<RideDispatchRequestRow>("ride_dispatch_requests")
        .where({ id: offerId })
        .forUpdate()
        .first();
      if (!offer) throw new NotFoundError("Offer not found");
      if (offer.driver_id !== driverId) throw new ForbiddenError("This offer is not for you");
      if (offer.status !== "offered") {
        throw new ConflictError(`Offer is no longer active (status: ${offer.status})`);
      }
      if (new Date(offer.expires_at).getTime() < Date.now()) {
        throw new ConflictError("Offer has expired");
      }

      if (action === "decline") {
        await trx<RideDispatchRequestRow>("ride_dispatch_requests")
          .where({ id: offerId })
          .update({ status: "declined", responded_at: new Date() });
        await auditService.log(
          offer.ride_id,
          { userId: driverId, role: "driver" },
          "dispatch_declined",
          { offerId },
          trx
        );
        return { action: "decline" as const, rideId: offer.ride_id };
      }

      const ride = await trx<RideRow>("rides").where({ id: offer.ride_id }).forUpdate().first();
      if (!ride) throw new NotFoundError("Ride not found");
      if (ride.status !== "pending_assignment" || ride.driver_id) {
        throw new ConflictError("Ride is no longer available — it may have already been assigned");
      }

      await trx<RideDispatchRequestRow>("ride_dispatch_requests")
        .where({ id: offerId })
        .update({ status: "accepted", responded_at: new Date() });

      // Sequential dispatch means there's normally only ever one "offered"
      // row per ride, but guard against any stragglers anyway.
      await trx<RideDispatchRequestRow>("ride_dispatch_requests")
        .where({ ride_id: offer.ride_id, status: "offered" })
        .andWhereNot({ id: offerId })
        .update({ status: "superseded" });

      const [updatedRide] = await trx<RideRow>("rides")
        .where({ id: offer.ride_id })
        .update({ driver_id: driverId, status: "driver_assigned", assigned_at: new Date() })
        .returning("*");

      await auditService.log(
        offer.ride_id,
        { userId: driverId, role: "driver" },
        "dispatch_accepted",
        { offerId },
        trx
      );

      return { action: "accept" as const, ride: updatedRide };
    });

    offerTimeoutStore.cancel(offerId);

    if (result.action === "decline") {
      await tryNextDriver(result.rideId);
      return null;
    }

    const { ride } = result;
    await notificationService.notifyRiderRideUpdated(ride.rider_id, ride.id, "driver_assigned");
    emitToRider(ride.rider_id, "ride:status", { rideId: ride.id, status: ride.status });
    emitToOwners("ride:dispatch:accepted", { rideId: ride.id, driverId: ride.driver_id });
    emitToRideWatchers(ride.id, "ride:status", { rideId: ride.id, status: ride.status });
    return ride;
  },
};