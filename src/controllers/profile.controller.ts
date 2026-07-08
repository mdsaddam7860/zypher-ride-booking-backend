import { Request, Response, NextFunction } from "express";
import { profileService, serializeDriverProfile, serializeRiderProfile } from "../services/profile.service";
import { UnauthorizedError } from "../utils/errors";

export const profileController = {
  // GET /api/owner/riders/:riderId — owner looks up any rider's profile.
  async getRiderByIdForOwner(req: Request<{ riderId: string }>, res: Response, next: NextFunction) {
    try {
      const rider = await profileService.getRiderById(req.params.riderId);
      res.status(200).json(serializeRiderProfile(rider));
    } catch (err) {
      next(err);
    }
  },

  // GET /api/rider/me — rider pulls their own profile.
  async getMyRiderProfile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const rider = await profileService.getRiderById(req.user.userId);
      res.status(200).json(serializeRiderProfile(rider));
    } catch (err) {
      next(err);
    }
  },

  // GET /api/driver/me — driver pulls their own profile.
  async getMyDriverProfile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const driver = await profileService.getDriverById(req.user.userId);
      res.status(200).json(serializeDriverProfile(driver));
    } catch (err) {
      next(err);
    }
  },
};
