import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import { validateBody } from "../middleware/validation.middleware";
import { loginSchema, registerSchema } from "../validators/auth.validator";

const router = Router();

router.post("/register/rider", validateBody(registerSchema), authController.registerRider);
router.post("/register/driver", validateBody(registerSchema), authController.registerDriver);

router.post("/login/rider", validateBody(loginSchema), authController.loginRider);
router.post("/login/driver", validateBody(loginSchema), authController.loginDriver);
router.post("/login/owner", validateBody(loginSchema), authController.loginOwner);

export default router;
