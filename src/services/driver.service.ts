import { db } from "../db/connection";
import { DriverLocationRow, DriverRow, DriverStatus, LatLng } from "../types";
import { haversineDistanceMeters } from "../utils/geoutils";
import { NotFoundError } from "../utils/errors";

export interface DriverWithLocation {
  id: string;
  name: string;
  status: DriverStatus;
  lat: number;
  lng: number;
  updatedAt: Date;
  distanceMeters?: number;
}

export const driverService = {
  async upsertLocation(driverId: string, location: LatLng): Promise<void> {
    await db<DriverLocationRow>("driver_locations")
      .insert({
        driver_id: driverId,
        lat: location.lat,
        lng: location.lng,
        updated_at: new Date(),
      })
      .onConflict("driver_id")
      .merge({ lat: location.lat, lng: location.lng, updated_at: new Date() });
  },

  async setStatus(driverId: string, status: DriverStatus): Promise<void> {
    const updated = await db<DriverRow>("drivers").where({ id: driverId }).update({ status });
    if (updated === 0) throw new NotFoundError("Driver not found");
  },

  async listAvailableWithLocation(): Promise<DriverWithLocation[]> {
    const rows = await db<DriverRow>("drivers")
      .join("driver_locations", "drivers.id", "driver_locations.driver_id")
      .where("drivers.status", "available")
      .select(
        "drivers.id as id",
        "drivers.name as name",
        "drivers.status as status",
        "driver_locations.lat as lat",
        "driver_locations.lng as lng",
        "driver_locations.updated_at as updatedAt"
      );

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      lat: Number(r.lat),
      lng: Number(r.lng),
      updatedAt: r.updatedAt,
    }));
  },

  /**
   * Available drivers sorted by straight-line distance to a target point.
   * Good enough for a manual-assignment owner dashboard; swap for a PostGIS
   * ST_Distance query or routing-API ETA if you need true driving distance.
   */
  async listNearbyAvailable(target: LatLng): Promise<DriverWithLocation[]> {
    const drivers = await this.listAvailableWithLocation();
    return drivers
      .map((d) => ({ ...d, distanceMeters: haversineDistanceMeters(target, { lat: d.lat, lng: d.lng }) }))
      .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  },
};
