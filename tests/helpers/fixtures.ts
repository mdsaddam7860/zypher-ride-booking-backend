import request from "supertest";
import { Express } from "express";
import bcrypt from "bcryptjs";
import { db } from "../../src/db/connection";

export async function createRider(app: Express, overrides: Partial<Record<string, string>> = {}) {
  const body = {
    name: "Alice Rider",
    email: overrides.email ?? "alice@test.com",
    phone: overrides.phone ?? "+15551234001",
    password: "password123",
  };
  const res = await request(app).post("/api/auth/register/rider").send(body);
  return { token: res.body.token as string, userId: res.body.userId as string };
}

export async function createDriver(app: Express, overrides: Partial<Record<string, string>> = {}) {
  const body = {
    name: "Bob Driver",
    email: overrides.email ?? "bob@test.com",
    phone: overrides.phone ?? "+15551234002",
    password: "password123",
  };
  const res = await request(app).post("/api/auth/register/driver").send(body);
  return { token: res.body.token as string, userId: res.body.userId as string };
}

// Owners have no public registration endpoint by design, so tests insert directly.
export async function createOwner(app: Express, email = "owner@test.com", password = "password123") {
  const password_hash = await bcrypt.hash(password, 4); // low cost factor: tests only
  await db("owners").insert({ email, password_hash });
  const res = await request(app).post("/api/auth/login/owner").send({ email, password });
  return { token: res.body.token as string, userId: res.body.userId as string };
}

export async function makeDriverAvailable(app: Express, driverToken: string, lat = 40.73, lng = -73.995) {
  await request(app)
    .post("/api/drivers/location")
    .set("Authorization", `Bearer ${driverToken}`)
    .send({ lat, lng });
  await request(app).post("/api/drivers/status/available").set("Authorization", `Bearer ${driverToken}`);
}

export async function createFare(app: Express, riderToken?: string, vehicleType = "4_seater") {
  const req = request(app).post("/api/fares");
  if (riderToken) req.set("Authorization", `Bearer ${riderToken}`);
  const res = await req.send({
    pickupLocation: { lat: 40.7128, lng: -74.006 },
    destination: { lat: 40.758, lng: -73.9855 },
    vehicleType,
  });
  return res.body.fareId as string;
}

// Default request body for POST /api/rides in tests — scheduled ~1 hour out, cash payment.
export function rideRequestBody(fareId: string, overrides: Record<string, unknown> = {}) {
  return {
    fareId,
    scheduledStartAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    paymentMethod: "cash",
    ...overrides,
  };
}
