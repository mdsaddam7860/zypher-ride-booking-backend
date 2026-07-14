import { Request, Response, NextFunction } from "express";
import { driverDocumentService } from "../services/driver-document.service";
import { UnauthorizedError } from "../utils/errors";
import { SubmitDriverDocumentsInput, VerifyDriverDocumentsInput } from "../validators/driver-document.validator";

export const driverDocumentController = {
  // GET /api/drivers/documents/me — driver views their own submitted documents.
  async getMine(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const doc = await driverDocumentService.getByDriverId(req.user.userId);
      res.status(200).json(doc);
    } catch (err) {
      next(err);
    }
  },

  // POST /api/drivers/documents — driver submits/updates Aadhaar, license, vehicle details.
  async submit(req: Request<unknown, unknown, SubmitDriverDocumentsInput>, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const doc = await driverDocumentService.submit(req.user.userId, req.body);
      res.status(200).json(doc);
    } catch (err) {
      next(err);
    }
  },

  // GET /api/owner/drivers/:driverId/documents — owner reviews a driver's submitted documents.
  async getForOwner(req: Request<{ driverId: string }>, res: Response, next: NextFunction) {
    try {
      const doc = await driverDocumentService.getByDriverId(req.params.driverId);
      res.status(200).json(doc);
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/owner/drivers/:driverId/documents/verify — owner approves/rejects.
  async verify(
    req: Request<{ driverId: string }, unknown, VerifyDriverDocumentsInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await driverDocumentService.setVerification(
        req.params.driverId,
        req.user.userId,
        req.body.isVerified
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};