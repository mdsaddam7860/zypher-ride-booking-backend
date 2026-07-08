import { Router } from "express";
import { fareController } from "../controllers/fare.controller";
import { attachUserIfPresent } from "../middleware/auth.middleware";
import { validateBody } from "../middleware/validation.middleware";
import { createFareSchema } from "../validators/fare.validator";

const router = Router();

// Auth is optional: an unauthenticated rider can still get a fare estimate,
// but if a valid rider JWT is present it gets tied to fares.rider_id.
router.post("/", attachUserIfPresent, validateBody(createFareSchema), fareController.create);

export default router;
