import bcrypt from "bcryptjs";
import { db } from "../db/connection";
import { signToken } from "../utils/jwt";
import { ConflictError, UnauthorizedError } from "../utils/errors";
import { DriverRow, OwnerRow, Role, RiderRow } from "../types";

const SALT_ROUNDS = 10;

export interface RegisterRiderOrDriverInput {
  name: string;
  email: string;
  phone: string;
  password: string;
}

export interface AuthResult {
  token: string;
  userId: string;
  role: Role;
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Generates a 4-digit ride OTP not currently in use by any other rider. */
async function generateUniqueRideOtp(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    const existing = await db<RiderRow>("riders").where({ ride_otp: candidate }).first();
    if (!existing) return candidate;
  }
  // Astronomically unlikely with only ~10k riders and 20 retries, but fail
  // loudly rather than silently assigning a duplicate OTP.
  throw new Error("Could not generate a unique rider OTP after 20 attempts");
}

export const authService = {
  async registerRider(input: RegisterRiderOrDriverInput): Promise<AuthResult> {
    const existing = await db<RiderRow>("riders")
      .where({ email: input.email })
      .orWhere({ phone: input.phone })
      .first();
    if (existing) throw new ConflictError("A rider with this email or phone already exists");

    const password_hash = await hashPassword(input.password);
    const ride_otp = await generateUniqueRideOtp();
    const [row] = await db<RiderRow>("riders")
      .insert({ name: input.name, email: input.email, phone: input.phone, password_hash, ride_otp })
      .returning("id");

    const userId = row.id;
    return { token: signToken({ userId, role: "rider" }), userId, role: "rider" };
  },

  async registerDriver(input: RegisterRiderOrDriverInput): Promise<AuthResult> {
    const existing = await db<DriverRow>("drivers")
      .where({ email: input.email })
      .orWhere({ phone: input.phone })
      .first();
    if (existing) throw new ConflictError("A driver with this email or phone already exists");

    const password_hash = await hashPassword(input.password);
    const [row] = await db<DriverRow>("drivers")
      .insert({
        name: input.name,
        email: input.email,
        phone: input.phone,
        password_hash,
        status: "offline",
      })
      .returning("id");

    const userId = row.id;
    return { token: signToken({ userId, role: "driver" }), userId, role: "driver" };
  },

  async login(email: string, password: string, role: "rider" | "driver"): Promise<AuthResult> {
    const table = role === "rider" ? "riders" : "drivers";
    const user = await db<RiderRow | DriverRow>(table).where({ email }).first();
    if (!user) throw new UnauthorizedError("Invalid email or password");

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedError("Invalid email or password");

    return { token: signToken({ userId: user.id, role }), userId: user.id, role };
  },

  async ownerLogin(email: string, password: string): Promise<AuthResult> {
    const owner = await db<OwnerRow>("owners").where({ email }).first();
    if (!owner) throw new UnauthorizedError("Invalid email or password");

    const valid = await bcrypt.compare(password, owner.password_hash);
    if (!valid) throw new UnauthorizedError("Invalid email or password");

    return { token: signToken({ userId: owner.id, role: "owner" }), userId: owner.id, role: "owner" };
  },
};