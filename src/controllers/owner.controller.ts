import { Request, Response, NextFunction } from "express";
import { ownerService } from "../services/owner.service";
import { driverService } from "../services/driver.service";
import { rideService } from "../services/ride.service";
import { fareService } from "../services/fare.service";
import { serializeRide } from "../utils/serializers";
import { buildContact } from "../utils/contact";
import {
  AssignDriverInput,
  NearbyDriversQuery,
  ListRidesQuery,
  ListFaresQuery,
} from "../validators/owner.validator";
import { UnauthorizedError } from "../utils/errors";

function serializeFare(fare: Awaited<ReturnType<typeof ownerService.getFareById>>) {
  return {
    fareId: fare.id,
    riderId: fare.rider_id,
    vehicleType: fare.vehicle_type,
    pickup: { lat: Number(fare.pickup_lat), lng: Number(fare.pickup_lng), address: fare.pickup_address },
    dropoff: {
      lat: Number(fare.dropoff_lat),
      lng: Number(fare.dropoff_lng),
      address: fare.dropoff_address,
    },
    distanceMeters: fare.distance_meters,
    durationSeconds: fare.duration_seconds,
    estimatedPrice: Number(fare.estimated_price),
    currency: fare.currency,
    createdAt: fare.created_at,
    expiresAt: fare.expires_at,
  };
}

export const ownerController = {
  async listPendingRides(_req: Request, res: Response, next: NextFunction) {
    try {
      const rides = await ownerService.listPendingRides();
      res.status(200).json(rides.map((r) => serializeRide(r, { viewerRole: "owner" })));
    } catch (err) {
      next(err);
    }
  },

  // Every ride — in-progress, pending, completed, cancelled — sorted so
  // active work bubbles to the top. Optional ?status= filter.
  async listAllRides(
    req: Request<unknown, unknown, unknown, ListRidesQuery>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const rides = await rideService.listAllForOwner(req.query.status);
      const withFares = await Promise.all(
        rides.map(async (ride) => {
          const fare = await fareService.getById(ride.fare_id);
          const contact = await buildContact(ride, "owner");
          return serializeRide(ride, { fare, viewerRole: "owner", contact });
        })
      );
      res.status(200).json(withFares);
    } catch (err) {
      next(err);
    }
  },

  async listAvailableDrivers(_req: Request, res: Response, next: NextFunction) {
    try {
      const drivers = await driverService.listAvailableWithLocation();
      res.status(200).json(drivers);
    } catch (err) {
      next(err);
    }
  },

  async listNearbyDrivers(req: Request<unknown, unknown, unknown, NearbyDriversQuery>, res: Response, next: NextFunction) {
    try {
      const pickup = await ownerService.getPickupPoint(req.query.rideId);
      const drivers = await driverService.listNearbyAvailable(pickup);
      res.status(200).json(drivers);
    } catch (err) {
      next(err);
    }
  },

  async assignDriver(
    req: Request<{ rideId: string }, unknown, AssignDriverInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const ride = await rideService.assignDriver(req.params.rideId, req.body.driverId, req.user.userId);
      const fare = await fareService.getById(ride.fare_id);
      const contact = await buildContact(ride, "owner");
      res.status(200).json(serializeRide(ride, { fare, viewerRole: "owner", contact }));
    } catch (err) {
      next(err);
    }
  },

  // GET /api/owner/fares — browse/filter fare estimates (rate review / audit).
  async listFares(req: Request, res: Response, next: NextFunction) {
    try {
      const { vehicleType, riderId, bookedOnly, limit, offset } = req.query as unknown as ListFaresQuery;
      const { fares, total } = await ownerService.listFares({
        vehicleType,
        riderId,
        bookedOnly,
        limit,
        offset,
      });
      res.status(200).json({
        fares: fares.map(serializeFare),
        total,
        limit,
        offset,
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/owner/fares/pricing — current per-vehicle-type rates (config-driven, read-only).
  async getPricing(_req: Request, res: Response, next: NextFunction) {
    try {
      res.status(200).json(ownerService.getPricingConfig());
    } catch (err) {
      next(err);
    }
  },

  // GET /api/owner/fares/:fareId
  async getFare(req: Request<{ fareId: string }>, res: Response, next: NextFunction) {
    try {
      const fare = await ownerService.getFareById(req.params.fareId);
      res.status(200).json(serializeFare(fare));
    } catch (err) {
      next(err);
    }
  },
};