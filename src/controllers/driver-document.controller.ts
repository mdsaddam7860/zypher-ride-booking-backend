import { Request, Response, NextFunction } from "express";
import { driverDocumentService } from "../services/driver-document.service";
import { uploadImageBuffer } from "../services/cloudinary.service";
import { config } from "../config";
import { UnauthorizedError } from "../utils/errors";
import { SubmitDriverDocumentsInput, VerifyDriverDocumentsInput } from "../validators/driver-document.validator";

type DocumentFiles = {
  aadharPhoto?: Express.Multer.File[];
  licensePhoto?: Express.Multer.File[];
  vehiclePhoto?: Express.Multer.File[];
};

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

  /**
   * POST /api/drivers/documents — driver submits/updates Aadhaar, license,
   * vehicle details. Expects multipart/form-data: text fields as usual
   * (aadharNumber, licenseNumber, licenseExpiry, vehicleRegistrationNumber,
   * vehicleModel) plus up to three image files (aadharPhoto, licensePhoto,
   * vehiclePhoto — see upload.middleware.ts). Each provided file is
   * uploaded to Cloudinary and its URL saved; a body field with the
   * matching *PhotoUrl name is used instead if no file was attached (e.g.
   * the frontend already has a hosted URL from elsewhere).
   */
  async submit(req: Request<unknown, unknown, SubmitDriverDocumentsInput>, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const files = req.files as DocumentFiles | undefined;
      const folder = config.cloudinary.driverDocumentsFolder;

      const [aadharPhotoUrl, licensePhotoUrl, vehiclePhotoUrl] = await Promise.all([
        files?.aadharPhoto?.[0] ? uploadImageBuffer(files.aadharPhoto[0].buffer, folder) : undefined,
        files?.licensePhoto?.[0] ? uploadImageBuffer(files.licensePhoto[0].buffer, folder) : undefined,
        files?.vehiclePhoto?.[0] ? uploadImageBuffer(files.vehiclePhoto[0].buffer, folder) : undefined,
      ]);

      const doc = await driverDocumentService.submit(req.user.userId, {
        ...req.body,
        aadharPhotoUrl: aadharPhotoUrl ?? req.body.aadharPhotoUrl,
        licensePhotoUrl: licensePhotoUrl ?? req.body.licensePhotoUrl,
        vehiclePhotoUrl: vehiclePhotoUrl ?? req.body.vehiclePhotoUrl,
      });
      res.status(200).json(doc);
    } catch (err) {
      next(err);
    }
  },

  // GET /api/owner/drivers/pending-documents — review queue of unverified submissions.
  async listPending(_req: Request, res: Response, next: NextFunction) {
    try {
      const docs = await driverDocumentService.listPending();
      res.status(200).json(docs);
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
        req.body.isVerified,
        req.body.rejectionReason
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};