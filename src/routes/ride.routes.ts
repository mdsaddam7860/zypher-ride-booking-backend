import { Router } from "express";
import { rideController } from "../controllers/ride.controller";
import { ownerController } from "../controllers/owner.controller";
import { dispatchController } from "../controllers/dispatch.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { validateBody } from "../middleware/validation.middleware";
import {
  cancelRideSchema,
  createRideSchema,
  dispatchOfferResponseSchema,
  driverResponseSchema,
  editRideSchema,
  startRideSchema,
} from "../validators/ride.validator";
import { assignDriverSchema } from "../validators/owner.validator";

const router = Router();

router.use(requireAuth);

// Rider requests a ride from a fare estimate (books in advance via scheduledStartAt).
router.post("/", requireRole("rider"), validateBody(createRideSchema), rideController.create);

// Past rides for the caller (rider/driver: own history, owner: all).
router.get("/history", rideController.history);

// Driver accepts/declines an auto-dispatch offer (sequential nearest-driver search).
router.post(
  "/offers/:offerId/respond",
  requireRole("driver"),
  validateBody(dispatchOfferResponseSchema),
  dispatchController.respond
);

// Rider, assigned driver, or owner can view a ride.
router.get("/:id", rideController.getById);

// Owner-only edit (pickup/dropoff/vehicle_type/notes), only while unassigned.
router.patch("/:id/edit", requireRole("owner"), validateBody(editRideSchema), rideController.edit);

// POST /api/rides/:rideId/assign-driver — owner assigns a driver to a pending ride.
router.post(
  "/:rideId/assign-driver",
  requireRole("owner"),
  validateBody(assignDriverSchema),
  ownerController.assignDriver
);

// Owner and admin only — chronological audit trail of all changes to a ride.
router.get("/:rideId/audit", requireRole("owner"), rideController.audit);

// Rider, assigned driver, or owner can cancel (subject to status + refund rules in the service).
router.patch("/:id/cancel", validateBody(cancelRideSchema), rideController.cancel);

// Rider confirms/pays their advance-payment order for a long-distance ride.
router.post("/:id/pay", requireRole("rider"), rideController.pay);

// Driver accepts/denies an assignment.
router.patch("/:id", requireRole("driver"), validateBody(driverResponseSchema), rideController.respond);

// Driver marks themselves as arrived at the pickup point (before starting the ride).
router.post("/:id/arrive", requireRole("driver"), rideController.arrive);

// Driver marks ride started / completed.
router.post("/:id/start", requireRole("driver"), validateBody(startRideSchema), rideController.start);
router.post("/:id/complete", requireRole("driver"), rideController.complete);

export default router;