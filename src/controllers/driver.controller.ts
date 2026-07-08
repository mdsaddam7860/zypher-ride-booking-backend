import { Request, Response, NextFunction } from "express";
import { driverService } from "../services/driver.service";
import { LatLng } from "../types";
import { UnauthorizedError } from "../utils/errors";

export const driverController = {
  async updateLocation(req: Request<unknown, unknown, LatLng>, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      await driverService.upsertLocation(req.user.userId, req.body);
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
