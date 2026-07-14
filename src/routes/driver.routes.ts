import { Router } from "express";
import { driverController } from "../controllers/driver.controller";
import { profileController } from "../controllers/profile.controller";
import { driverDocumentController } from "../controllers/driver-document.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { validateBody } from "../middleware/validation.middleware";
import { updateLocationSchema } from "../validators/driver.validator";
import { changePasswordSchema, updateProfileSchema } from "../validators/profile.validator";
import { submitDriverDocumentsSchema } from "../validators/driver-document.validator";

const router = Router();

router.use(requireAuth, requireRole("driver"));

// GET /api/drivers/me — driver pulls their own profile.
router.get("/me", profileController.getMyDriverProfile);
// PATCH /api/drivers/me — update own name/email/phone/profilePhotoUrl.
router.patch("/me", validateBody(updateProfileSchema), profileController.updateMyProfile);
// PATCH /api/drivers/me/password — change own password (requires current password).
router.patch("/me/password", validateBody(changePasswordSchema), profileController.changeMyPassword);

// GET/POST /api/drivers/documents — driver views/submits Aadhaar, license, vehicle details.
router.get("/documents/me", driverDocumentController.getMine);
router.post("/documents", validateBody(submitDriverDocumentsSchema), driverDocumentController.submit);

router.post("/location", validateBody(updateLocationSchema), driverController.updateLocation);
router.post("/status/available", driverController.setAvailable);
router.post("/status/offline", driverController.setOffline);

export default router;