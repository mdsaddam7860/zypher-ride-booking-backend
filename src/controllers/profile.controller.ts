import { Request, Response, NextFunction } from "express";
import {
  profileService,
  serializeDriverProfile,
  serializeOwnerProfile,
  serializeRiderProfile,
} from "../services/profile.service";
import { UnauthorizedError } from "../utils/errors";
import { ChangePasswordInput, UpdateProfileInput } from "../validators/profile.validator";
import { uploadImageBuffer } from "../services/cloudinary.service";
import { config } from "../config";

function serializeForRole(role: "rider" | "driver" | "owner", row: unknown) {
  if (role === "rider") return serializeRiderProfile(row as Parameters<typeof serializeRiderProfile>[0]);
  if (role === "driver") return serializeDriverProfile(row as Parameters<typeof serializeDriverProfile>[0]);
  return serializeOwnerProfile(row as Parameters<typeof serializeOwnerProfile>[0]);
}

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

  // GET /api/riders/me — rider pulls their own profile.
  async getMyRiderProfile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const rider = await profileService.getRiderById(req.user.userId);
      res.status(200).json(serializeRiderProfile(rider, { includeOtp: true }));
    } catch (err) {
      next(err);
    }
  },

  // GET /api/drivers/me — driver pulls their own profile.
  async getMyDriverProfile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const driver = await profileService.getDriverById(req.user.userId);
      res.status(200).json(serializeDriverProfile(driver));
    } catch (err) {
      next(err);
    }
  },

  // GET /api/owner/me — owner pulls their own profile.
  async getMyOwnerProfile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const owner = await profileService.getOwnerById(req.user.userId);
      res.status(200).json(serializeOwnerProfile(owner));
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/{riders,drivers}/me and /api/owner/me — update own profile.
  // PATCH /api/{riders,drivers,owner}/me — update own profile. If a
  // `profilePhoto` file was uploaded (driver only, via uploadProfilePhoto
  // middleware on the route), it's uploaded to Cloudinary and takes
  // precedence over a plain `profilePhotoUrl` string in the body.
  async updateMyProfile(req: Request<unknown, unknown, UpdateProfileInput>, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const role = req.user.role;

      const file = req.file as Express.Multer.File | undefined;
      const profilePhotoUrl = file
        ? await uploadImageBuffer(file.buffer, config.cloudinary.profilePhotosFolder)
        : req.body.profilePhotoUrl;

      const updated = await profileService.updateProfile(role, req.user.userId, {
        ...req.body,
        profilePhotoUrl,
      });
      res.status(200).json(serializeForRole(role, updated));
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/{riders,drivers}/me/password and /api/owner/me/password.
  async changeMyPassword(
    req: Request<unknown, unknown, ChangePasswordInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) throw new UnauthorizedError();
      await profileService.changePassword(
        req.user.role,
        req.user.userId,
        req.body.currentPassword,
        req.body.newPassword
      );
      res.status(200).json({ message: "Password updated successfully" });
    } catch (err) {
      next(err);
    }
  },
};