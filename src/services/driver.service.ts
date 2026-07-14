import { db } from "../db/connection";
import { DriverLocationRow, DriverRow, DriverStatus, LatLng } from "../types";
import { haversineDistanceMeters } from "../utils/geoutils";
import { NotFoundError, ConflictError } from "../utils/errors";

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

  async getLastLocation(driverId: string): Promise<LatLng | null> {
    const row = await db<DriverLocationRow>("driver_locations").where({ driver_id: driverId }).first();
    if (!row) return null;
    return { lat: Number(row.lat), lng: Number(row.lng) };
  },

  async getById(driverId: string): Promise<DriverRow> {
    const driver = await db<DriverRow>("drivers").where({ id: driverId }).first();
    if (!driver) throw new NotFoundError("Driver not found");
    return driver;
  },

  /**
   * Sets a driver's online status. Going "available" requires `is_active`
   * (i.e. their documents — Aadhaar/license/vehicle — have been verified and
   * the license hasn't expired) — see driver-document.service.ts, which is
   * what actually flips `is_active`. Going "offline" is always allowed.
   */
  async setStatus(driverId: string, status: DriverStatus): Promise<void> {
    const driver = await db<DriverRow>("drivers").where({ id: driverId }).first();
    if (!driver) throw new NotFoundError("Driver not found");

    if (status === "available" && !driver.is_active) {
      throw new ConflictError(
        "Driver account is not active — submit valid Aadhaar, license, and vehicle documents for verification before going online"
      );
    }

    await db<DriverRow>("drivers").where({ id: driverId }).update({ status });
  },

  async listAvailableWithLocation(): Promise<DriverWithLocation[]> {
    const rows = await db<DriverRow>("drivers")
      .join("driver_locations", "drivers.id", "driver_locations.driver_id")
      .where("drivers.status", "available")
      .andWhere("drivers.is_active", true)
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

  /**
   * Real geospatial nearest-driver search via PostGIS, used by the
   * auto-dispatch flow (dispatch.service.ts). Uses the `geog` column kept in
   * sync by the `driver_locations_sync_geog` trigger. Only considers drivers
   * who are both `available` and `is_active` (documents verified). Returns
   * drivers ordered nearest-first, capped to `limit`.
   */
  async findNearestAvailable(
    target: LatLng,
    opts: { radiusMeters: number; limit: number }
  ): Promise<(DriverWithLocation & { distanceMeters: number })[]> {
    const rows = await db("drivers as d")
      .join("driver_locations as dl", "d.id", "dl.driver_id")
      .where("d.status", "available")
      .andWhere("d.is_active", true)
      .whereRaw("ST_DWithin(dl.geog, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?)", [
        target.lng,
        target.lat,
        opts.radiusMeters,
      ])
      .select(
        "d.id as id",
        "d.name as name",
        "d.status as status",
        "dl.lat as lat",
        "dl.lng as lng",
        "dl.updated_at as updatedAt"
      )
      .select(
        db.raw(
          "ST_Distance(dl.geog, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography) as distance_meters",
          [target.lng, target.lat]
        )
      )
      .orderBy("distance_meters", "asc")
      .limit(opts.limit);

    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      lat: Number(r.lat),
      lng: Number(r.lng),
      updatedAt: r.updatedAt,
      distanceMeters: Math.round(Number(r.distance_meters)),
    }));
  },
};