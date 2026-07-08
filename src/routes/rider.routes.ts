import { Router } from "express";
import { profileController } from "../controllers/profile.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";

const router = Router();

router.use(requireAuth, requireRole("rider"));

// GET /api/riders/me — rider pulls their own profile.
router.get("/me", profileController.getMyRiderProfile);

export default router;