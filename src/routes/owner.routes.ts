import { Router } from "express";
import { ownerController } from "../controllers/owner.controller";
import { profileController } from "../controllers/profile.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { validateQuery, validateBody } from "../middleware/validation.middleware";
import {
  assignDriverSchema,
  listFaresQuerySchema,
  listRidesQuerySchema,
  nearbyDriversQuerySchema,
} from "../validators/owner.validator";

const router = Router();

router.use(requireAuth, requireRole("owner"));

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

export default router;