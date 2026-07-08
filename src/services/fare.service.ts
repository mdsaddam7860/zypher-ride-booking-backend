import { db } from "../db/connection";
import { config } from "../config";
import { getRouteEstimate } from "./mapping.service";
import { calculateFare, isLongDistance } from "../utils/pricing";
import { FareRow, LatLng, VehicleType } from "../types";
import { NotFoundError } from "../utils/errors";

export interface CreateFareInput {
  riderId: string | null;
  pickup: LatLng;
  pickupAddress?: string;
  dropoff: LatLng;
  dropoffAddress?: string;
  vehicleType: VehicleType;
}

export interface FareEstimate {
  fareId: string;
  estimatedPrice: number;
  currency: string;
  vehicleType: VehicleType;
  distanceMeters: number;
  durationSeconds: number;
  isLongDistance: boolean;
  expiresAt: Date;
}

export const fareService = {
  async createEstimate(input: CreateFareInput): Promise<FareEstimate> {
    const { distanceMeters, durationSeconds } = await getRouteEstimate(input.pickup, input.dropoff);
    const estimatedPrice = calculateFare({
      distanceMeters,
      durationSeconds,
      vehicleType: input.vehicleType,
    });
    const expiresAt = new Date(Date.now() + config.fare.estimateTtlMinutes * 60 * 1000);

    const [row] = await db<FareRow>("fares")
      .insert({
        rider_id: input.riderId,
        pickup_lat: input.pickup.lat,
        pickup_lng: input.pickup.lng,
        pickup_address: input.pickupAddress ?? null,
        dropoff_lat: input.dropoff.lat,
        dropoff_lng: input.dropoff.lng,
        dropoff_address: input.dropoffAddress ?? null,
        distance_meters: distanceMeters,
        duration_seconds: durationSeconds,
        estimated_price: estimatedPrice,
        currency: config.fare.currency,
        vehicle_type: input.vehicleType,
        expires_at: expiresAt,
      })
      .returning(["id", "expires_at"]);

    return {
      fareId: row.id,
      estimatedPrice,
      currency: config.fare.currency,
      vehicleType: input.vehicleType,
      distanceMeters,
      durationSeconds,
      isLongDistance: isLongDistance(distanceMeters),
      expiresAt: row.expires_at,
    };
  },

  async getById(fareId: string): Promise<FareRow> {
    const fare = await db<FareRow>("fares").where({ id: fareId }).first();
    if (!fare) throw new NotFoundError("Fare not found");
    return fare;
  },
};
