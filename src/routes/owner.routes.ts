import { Router } from "express";
import { ownerController } from "../controllers/owner.controller";
import { profileController } from "../controllers/profile.controller";
import { driverDocumentController } from "../controllers/driver-document.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { validateQuery, validateBody } from "../middleware/validation.middleware";
import {
  assignDriverSchema,
  listFaresQuerySchema,
  listRidesQuerySchema,
  nearbyDriversQuerySchema,
} from "../validators/owner.validator";
import { changePasswordSchema, updateProfileSchema } from "../validators/profile.validator";
import { verifyDriverDocumentsSchema } from "../validators/driver-document.validator";

const router = Router();

router.use(requireAuth, requireRole("owner"));

// GET/PATCH /api/owner/me — owner's own profile + password.
router.get("/me", profileController.getMyOwnerProfile);
router.patch("/me", validateBody(updateProfileSchema), profileController.updateMyProfile);
router.patch("/me/password", validateBody(changePasswordSchema), profileController.changeMyPassword);

router.get("/rides/pending", ownerController.listPendingRides);
// All rides — pending, in-progress, completed, etc — sorted for the dashboard.
router.get("/rides", validateQuery(listRidesQuerySchema), ownerController.listAllRides);

router.get("/drivers/available", ownerController.listAvailableDrivers);
router.get("/drivers/nearby", validateQuery(nearbyDriversQuerySchema), ownerController.listNearbyDrivers);

router.post("/rides/:rideId/assign", validateBody(assignDriverSchema), ownerController.assignDriver);

// Fare management. /pricing must be registered before /:fareId so it isn't
// swallowed as a fareId param.
router.get("/fares/pricing", ownerController.getPricing);
router.get("/fares", validateQuery(listFaresQuerySchema), ownerController.listFares);
router.get("/fares/:fareId", ownerController.getFare);

router.get("/riders/:riderId", profileController.getRiderByIdForOwner);

// Driver document review — Aadhaar/license/vehicle verification gating driver.is_active.
// Review queue — must be registered before the :driverId route below.
router.get("/drivers/pending-documents", driverDocumentController.listPending);
router.get("/drivers/:driverId/documents", driverDocumentController.getForOwner);
router.patch(
  "/drivers/:driverId/documents/verify",
  validateBody(verifyDriverDocumentsSchema),
  driverDocumentController.verify
);

export default router;