import { Router } from "express";
import { profileController } from "../controllers/profile.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { validateBody } from "../middleware/validation.middleware";
import { changePasswordSchema, updateProfileSchema } from "../validators/profile.validator";

const router = Router();

router.use(requireAuth, requireRole("rider"));

// GET /api/riders/me — rider pulls their own profile.
router.get("/me", profileController.getMyRiderProfile);
// PATCH /api/riders/me — update own name/email/phone.
router.patch("/me", validateBody(updateProfileSchema), profileController.updateMyProfile);
// PATCH /api/riders/me/password — change own password (requires current password).
router.patch("/me/password", validateBody(changePasswordSchema), profileController.changeMyPassword);

export default router;