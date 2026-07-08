import { Request, Response, NextFunction } from "express";
import { fareService } from "../services/fare.service";
import { CreateFareInput } from "../validators/fare.validator";

export const fareController = {
  async create(req: Request<unknown, unknown, CreateFareInput>, res: Response, next: NextFunction) {
    try {
      // Rider is optional here: the fare can be requested before login,
      // but if a valid JWT is present (see attachUserIfPresent) we tie it to the rider.
      const riderId = req.user?.role === "rider" ? req.user.userId : null;

      const estimate = await fareService.createEstimate({
        riderId,
        pickup: req.body.pickupLocation,
        pickupAddress: req.body.pickupAddress,
        dropoff: req.body.destination,
        dropoffAddress: req.body.destinationAddress,
        vehicleType: req.body.vehicleType,
      });

      res.status(201).json({
        fareId: estimate.fareId,
        estimatedPrice: estimate.estimatedPrice,
        currency: estimate.currency,
        vehicleType: estimate.vehicleType,
        distanceMeters: estimate.distanceMeters,
        durationSeconds: estimate.durationSeconds,
        isLongDistance: estimate.isLongDistance,
        expiresAt: estimate.expiresAt,
      });
    } catch (err) {
      next(err);
    }
  },
};
