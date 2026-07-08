import { config } from "../config";
import { VehicleType } from "../types";

export interface PriceInput {
  distanceMeters: number;
  durationSeconds: number;
  vehicleType: VehicleType;
}

/**
 * base fee + (distance in km * per-km rate) + (duration in minutes * per-minute rate),
 * with rates that vary by vehicle type (4-seater vs 7-seater). Currency is INR.
 * Kept as a pure function so it's easy to unit test and swap for a more
 * sophisticated pricing model (surge, ride categories, etc.) later.
 */
export function calculateFare({ distanceMeters, durationSeconds, vehicleType }: PriceInput): number {
  const distanceKm = distanceMeters / 1000;
  const durationMinutes = durationSeconds / 60;
  const rates = config.fare.vehiclePricing[vehicleType];

  const price = rates.baseFee + distanceKm * rates.perKm + durationMinutes * rates.perMinute;

  return Math.round(price * 100) / 100;
}

export function isLongDistance(distanceMeters: number): boolean {
  return distanceMeters >= config.fare.longDistanceThresholdMeters;
}
