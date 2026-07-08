// import { Router } from "express";
// import { driverController } from "../controllers/driver.controller";
// import { requireAuth, requireRole } from "../middleware/auth.middleware";
// import { validateBody } from "../middleware/validation.middleware";
// import { updateLocationSchema } from "../validators/driver.validator";

// const router = Router();

// router.use(requireAuth, requireRole("driver"));

// router.post("/location", validateBody(updateLocationSchema), driverController.updateLocation);
// router.post("/status/available", driverController.setAvailable);
// router.post("/status/offline", driverController.setOffline);

// export default router;
import { Router } from "express";
import { driverController } from "../controllers/driver.controller";
import { profileController } from "../controllers/profile.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { validateBody } from "../middleware/validation.middleware";
import { updateLocationSchema } from "../validators/driver.validator";

const router = Router();

router.use(requireAuth, requireRole("driver"));

// GET /api/drivers/me — driver pulls their own profile.
router.get("/me", profileController.getMyDriverProfile);

router.post("/location", validateBody(updateLocationSchema), driverController.updateLocation);
router.post("/status/available", driverController.setAvailable);
router.post("/status/offline", driverController.setOffline);

export default router;