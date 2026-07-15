import bcrypt from "bcryptjs";
import { db } from "../db/connection";
import { DriverRow, OwnerRow, Role, RiderRow } from "../types";
import { NotFoundError, UnauthorizedError, ConflictError, BadRequestError } from "../utils/errors";

const SALT_ROUNDS = 10;

function tableFor(role: Role): "riders" | "drivers" | "owners" {
  if (role === "rider") return "riders";
  if (role === "driver") return "drivers";
  return "owners";
}

export function serializeRiderProfile(rider: RiderRow, opts?: { includeOtp?: boolean }) {
  return {
    riderId: rider.id,
    name: rider.name,
    email: rider.email,
    phone: rider.phone,
    ...(opts?.includeOtp ? { rideOtp: rider.ride_otp } : {}),
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
    profilePhotoUrl: driver.profile_photo_url,
    isActive: driver.is_active,
    preferredRegion: driver.preferred_region,
    createdAt: driver.created_at,
  };
}

export function serializeOwnerProfile(owner: OwnerRow) {
  return {
    ownerId: owner.id,
    email: owner.email,
    createdAt: owner.created_at,
  };
}

export interface ProfileUpdateInput {
  name?: string;
  email?: string;
  phone?: string;
  profilePhotoUrl?: string;
  preferredRegion?: string;
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

  async getOwnerById(ownerId: string): Promise<OwnerRow> {
    const owner = await db<OwnerRow>("owners").where({ id: ownerId }).first();
    if (!owner) throw new NotFoundError("Owner not found");
    return owner;
  },

  /**
   * Updates the caller's own profile fields. `owners` has no `name`/`phone`
   * columns today, so those fields are simply ignored for that role (only
   * `email` applies) — see the OwnerRow type / migrations if you want to add
   * a display name for owners later.
   */
  async updateProfile(role: Role, userId: string, updates: ProfileUpdateInput) {
    const table = tableFor(role);
    const patch: Record<string, unknown> = {};

    if (updates.name !== undefined && role !== "owner") patch.name = updates.name;
    if (updates.phone !== undefined && role !== "owner") patch.phone = updates.phone;
    if (updates.email !== undefined) patch.email = updates.email;
    if (updates.profilePhotoUrl !== undefined && role === "driver") {
      patch.profile_photo_url = updates.profilePhotoUrl;
    }
    if (updates.preferredRegion !== undefined && role === "driver") {
      patch.preferred_region = updates.preferredRegion;
    }

    if (Object.keys(patch).length === 0) {
      throw new BadRequestError("No updatable fields provided for this role");
    }

    if (patch.email) {
      const existing = await db(table).where({ email: patch.email }).andWhereNot({ id: userId }).first();
      if (existing) throw new ConflictError("Email is already in use");
    }

    const [updated] = await db(table).where({ id: userId }).update(patch).returning("*");
    if (!updated) throw new NotFoundError(`${role} not found`);
    return updated;
  },

  /** Changes the caller's own password — requires the current password. */
  async changePassword(role: Role, userId: string, currentPassword: string, newPassword: string) {
    const table = tableFor(role);
    const user = await db<{ id: string; password_hash: string }>(table).where({ id: userId }).first();
    if (!user) throw new NotFoundError(`${role} not found`);

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) throw new UnauthorizedError("Current password is incorrect");

    const password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db(table).where({ id: userId }).update({ password_hash });
  },
};