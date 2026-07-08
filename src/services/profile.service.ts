import { db } from "../db/connection";
import { DriverRow, RiderRow } from "../types";
import { NotFoundError } from "../utils/errors";

export function serializeRiderProfile(rider: RiderRow) {
  return {
    riderId: rider.id,
    name: rider.name,
    email: rider.email,
    phone: rider.phone,
    createdAt: rider.created_at,
  };
}

export function serializeDriverProfile(driver: DriverRow) {
  return {
    driverId: driver.id,
    name: driver.name,
    email: driver.email,
    phone: driver.phone,
    status: driver.status,
    createdAt: driver.created_at,
  };
}

export const profileService = {
  async getRiderById(riderId: string): Promise<RiderRow> {
    const rider = await db<RiderRow>("riders").where({ id: riderId }).first();
    if (!rider) throw new NotFoundError("Rider not found");
    return rider;
  },

  async getDriverById(driverId: string): Promise<DriverRow> {
    const driver = await db<DriverRow>("drivers").where({ id: driverId }).first();
    if (!driver) throw new NotFoundError("Driver not found");
    return driver;
  },
};
