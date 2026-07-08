import { db } from "../db/connection";
import { config } from "../config";
import { FareRow, RideRow, VehicleType } from "../types";
import { NotFoundError } from "../utils/errors";

export interface ListFaresFilter {
  vehicleType?: VehicleType;
  riderId?: string;
  bookedOnly?: boolean;
  limit: number;
  offset: number;
}

export const ownerService = {
  async listPendingRides(): Promise<RideRow[]> {
    return db<RideRow>("rides").where({ status: "pending_assignment" }).orderBy("created_at", "asc");
  },

  async getPickupPoint(rideId: string): Promise<{ lat: number; lng: number }> {
    const ride = await db<RideRow>("rides").where({ id: rideId }).first();
    if (!ride) throw new NotFoundError("Ride not found");
    return { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) };
  },

  /**
   * Browse fare estimates for dispatch/pricing review — every quote given
   * out, whether or not it was ever turned into a ride. `bookedOnly` joins
   * against `rides` to show just the ones that were actually booked.
   */
  async listFares(filter: ListFaresFilter): Promise<{ fares: FareRow[]; total: number }> {
    const base = db<FareRow>("fares");
    if (filter.vehicleType) base.where({ vehicle_type: filter.vehicleType });
    if (filter.riderId) base.where({ rider_id: filter.riderId });
    if (filter.bookedOnly) {
      base.whereExists(function () {
        this.select(db.raw("1")).from("rides").whereRaw('"rides"."fare_id" = "fares"."id"');
      });
    }

    const countResult = (await base.clone().clearSelect().count({ count: "*" })) as unknown as {
      count: string | number;
    }[];
    const total = Number(countResult[0]?.count ?? 0);

    const fares = await base
      .clone()
      .orderBy("created_at", "desc")
      .limit(filter.limit)
      .offset(filter.offset);

    return { fares, total };
  },

  async getFareById(fareId: string): Promise<FareRow> {
    const fare = await db<FareRow>("fares").where({ id: fareId }).first();
    if (!fare) throw new NotFoundError("Fare not found");
    return fare;
  },

  /** Current per-vehicle-type pricing config, plus the long-distance threshold. Read-only — rates live in env/config. */
  getPricingConfig() {
    return {
      currency: config.fare.currency,
      longDistanceThresholdMeters: config.fare.longDistanceThresholdMeters,
      vehiclePricing: config.fare.vehiclePricing,
    };
  },
};