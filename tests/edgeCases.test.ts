import request from "supertest";
import { createApp } from "../src/app";
import { createRider, createDriver, createOwner, makeDriverAvailable, createFare, rideRequestBody } from "./helpers/fixtures";
import { db } from "../src/db/connection";

const app = createApp();

describe("Auth and access control", () => {
  it("rejects requests with no Authorization header", async () => {
    const res = await request(app).get("/api/rides/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(401);
  });

  it("rejects a rider calling an owner-only route", async () => {
    const rider = await createRider(app);
    const res = await request(app)
      .get("/api/owner/rides/pending")
      .set("Authorization", `Bearer ${rider.token}`);
    expect(res.status).toBe(403);
  });

  it("rejects duplicate registration with the same email", async () => {
    await createRider(app);
    const res = await request(app).post("/api/auth/register/rider").send({
      name: "Alice Again",
      email: "alice@test.com",
      phone: "+15559999999",
      password: "password123",
    });
    expect(res.status).toBe(409);
  });
});

describe("Validation", () => {
  it("rejects an out-of-range latitude", async () => {
    const res = await request(app)
      .post("/api/fares")
      .send({
        pickupLocation: { lat: 999, lng: -74.006 },
        destination: { lat: 40.758, lng: -73.9855 },
      });
    expect(res.status).toBe(400);
  });

  it("rejects a ride request with a malformed fareId", async () => {
    const rider = await createRider(app);
    const res = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${rider.token}`)
      .send({ fareId: "not-a-uuid" });
    expect(res.status).toBe(400);
  });
});

describe("Fare and ride state-machine rules", () => {
  it("rejects a ride request against an expired fare", async () => {
    const rider = await createRider(app);
    const fareId = await createFare(app, rider.token);

    // Force the fare into the past rather than waiting on a real TTL.
    await db("fares").where({ id: fareId }).update({ expires_at: new Date(Date.now() - 60_000) });

    const res = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${rider.token}`)
      .send(rideRequestBody(fareId));
    expect(res.status).toBe(400);
  });

  it("rejects a ride request against another rider's fare", async () => {
    const riderA = await createRider(app, { email: "a@test.com", phone: "+15550000001" });
    const riderB = await createRider(app, { email: "b@test.com", phone: "+15550000002" });
    const fareId = await createFare(app, riderA.token);

    const res = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${riderB.token}`)
      .send(rideRequestBody(fareId));
    expect(res.status).toBe(403);
  });

  it("returns the ride to pending_assignment when the driver denies", async () => {
    const rider = await createRider(app);
    const driver = await createDriver(app);
    const owner = await createOwner(app);
    await makeDriverAvailable(app, driver.token);
    const fareId = await createFare(app, rider.token);

    const rideRes = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${rider.token}`)
      .send(rideRequestBody(fareId));
    const rideId = rideRes.body.rideId;

    await request(app)
      .post(`/api/owner/rides/${rideId}/assign`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ driverId: driver.userId });

    const denyRes = await request(app)
      .patch(`/api/rides/${rideId}`)
      .set("Authorization", `Bearer ${driver.token}`)
      .send({ action: "deny" });

    expect(denyRes.status).toBe(200);
    expect(denyRes.body.status).toBe("pending_assignment");
    expect(denyRes.body.driverId).toBeNull();

    const availableRes = await request(app)
      .get("/api/owner/drivers/available")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(availableRes.body.some((d: { id: string }) => d.id === driver.userId)).toBe(true);
  });

  it("refuses to assign a driver who is not available", async () => {
    const rider = await createRider(app);
    const driver = await createDriver(app);
    const owner = await createOwner(app);
    // Note: driver never goes through makeDriverAvailable, so status stays 'offline'.
    const fareId = await createFare(app, rider.token);

    const rideRes = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${rider.token}`)
      .send(rideRequestBody(fareId));

    const res = await request(app)
      .post(`/api/owner/rides/${rideRes.body.rideId}/assign`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ driverId: driver.userId });

    expect(res.status).toBe(409);
  });

  it("allows a rider to cancel a pending ride but not a completed one", async () => {
    const rider = await createRider(app);
    const fareId = await createFare(app, rider.token);
    const rideRes = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${rider.token}`)
      .send(rideRequestBody(fareId));
    const rideId = rideRes.body.rideId;

    const cancelRes = await request(app)
      .patch(`/api/rides/${rideId}/cancel`)
      .set("Authorization", `Bearer ${rider.token}`)
      .send({ reason: "changed my mind" });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe("cancelled");

    const secondCancelRes = await request(app)
      .patch(`/api/rides/${rideId}/cancel`)
      .set("Authorization", `Bearer ${rider.token}`)
      .send({});
    expect(secondCancelRes.status).toBe(409);
  });
});

describe("Concurrency: assignment race guard", () => {
  it("only lets one of two simultaneous assign requests for the same driver succeed", async () => {
    const rider = await createRider(app);
    const driver = await createDriver(app);
    const owner = await createOwner(app);
    await makeDriverAvailable(app, driver.token);

    const fareIdA = await createFare(app, rider.token);
    const fareIdB = await createFare(app, rider.token);

    const rideA = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${rider.token}`)
      .send(rideRequestBody(fareIdA));
    const rideB = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${rider.token}`)
      .send(rideRequestBody(fareIdB));

    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/owner/rides/${rideA.body.rideId}/assign`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ driverId: driver.userId }),
      request(app)
        .post(`/api/owner/rides/${rideB.body.rideId}/assign`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ driverId: driver.userId }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    // Exactly one assignment should win (200) and the other should be rejected (409)
    // because the driver was locked as 'busy' by the winner before the loser's
    // transaction could read it as 'available'.
    expect(statuses).toEqual([200, 409]);
  });
});
