import { Request, Response, NextFunction } from "express";
import { driverService } from "../services/driver.service";
import { rideService } from "../services/ride.service";
import { LatLng } from "../types";
import { UnauthorizedError } from "../utils/errors";

export const driverController = {
  async updateLocation(req: Request<unknown, unknown, LatLng>, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      await driverService.upsertLocation(req.user.userId, req.body);

      // Best-effort geofence checks — auto-mark-arrived / auto-complete if
      // this location update happens to land the driver within range of the
      // relevant point for their current ride. No-ops if not applicable.
      await rideService.autoMarkArrivedIfNear(req.user.userId, req.body);
      await rideService.autoCompleteIfNearDropoff(req.user.userId, req.body);

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async setAvailable(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      await driverService.setStatus(req.user.userId, "available");
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async setOffline(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      await driverService.setStatus(req.user.userId, "offline");
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};