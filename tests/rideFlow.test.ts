import request from "supertest";
import { createApp } from "../src/app";
import { createRider, createDriver, createOwner, makeDriverAvailable, createFare, rideRequestBody } from "./helpers/fixtures";

const app = createApp();

describe("Full ride lifecycle (happy path)", () => {
  it("takes a ride from fare estimate through completion", async () => {
    const rider = await createRider(app);
    const driver = await createDriver(app);
    const owner = await createOwner(app);
    expect(rider.token).toBeTruthy();
    expect(driver.token).toBeTruthy();
    expect(owner.token).toBeTruthy();

    await makeDriverAvailable(app, driver.token);

    // Owner can see the driver as available before any ride exists.
    const availableRes = await request(app)
      .get("/api/owner/drivers/available")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(availableRes.status).toBe(200);
    expect(availableRes.body.some((d: { id: string }) => d.id === driver.userId)).toBe(true);

    // Rider gets a fare estimate.
    const fareRes = await request(app)
      .post("/api/fares")
      .set("Authorization", `Bearer ${rider.token}`)
      .send({
        pickupLocation: { lat: 40.7128, lng: -74.006 },
        destination: { lat: 40.758, lng: -73.9855 },
      });
    expect(fareRes.status).toBe(201);
    expect(typeof fareRes.body.fareId).toBe("string");
    expect(fareRes.body.estimatedPrice).toBeGreaterThan(0);

    // Rider requests a ride from that fare.
    const rideRes = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${rider.token}`)
      .send(rideRequestBody(fareRes.body.fareId));
    expect(rideRes.status).toBe(201);
    expect(rideRes.body.status).toBe("pending_assignment");
    const rideId = rideRes.body.rideId as string;

    // Owner sees it pending.
    const pendingRes = await request(app)
      .get("/api/owner/rides/pending")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(pendingRes.body.some((r: { rideId: string }) => r.rideId === rideId)).toBe(true);

    // Owner checks nearby drivers and assigns.
    const nearbyRes = await request(app)
      .get(`/api/owner/drivers/nearby?rideId=${rideId}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(nearbyRes.status).toBe(200);
    expect(nearbyRes.body[0].id).toBe(driver.userId);

    const assignRes = await request(app)
      .post(`/api/owner/rides/${rideId}/assign`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ driverId: driver.userId });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.status).toBe("driver_assigned");

    // Driver accepts.
    const acceptRes = await request(app)
      .patch(`/api/rides/${rideId}`)
      .set("Authorization", `Bearer ${driver.token}`)
      .send({ action: "accept" });
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.status).toBe("driver_accepted");

    // Driver starts and completes the trip.
    const startRes = await request(app)
      .post(`/api/rides/${rideId}/start`)
      .set("Authorization", `Bearer ${driver.token}`);
    expect(startRes.body.status).toBe("in_progress");

    const completeRes = await request(app)
      .post(`/api/rides/${rideId}/complete`)
      .set("Authorization", `Bearer ${driver.token}`);
    expect(completeRes.body.status).toBe("completed");

    // Driver should be available again post-trip.
    const availableAfterRes = await request(app)
      .get("/api/owner/drivers/available")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(availableAfterRes.body.some((d: { id: string }) => d.id === driver.userId)).toBe(true);
  });
});
