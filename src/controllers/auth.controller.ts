import { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service";
import { LoginInput, RegisterInput } from "../validators/auth.validator";

export const authController = {
  async registerRider(req: Request<unknown, unknown, RegisterInput>, res: Response, next: NextFunction) {
    try {
      const result = await authService.registerRider(req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },

  async registerDriver(req: Request<unknown, unknown, RegisterInput>, res: Response, next: NextFunction) {
    try {
      const result = await authService.registerDriver(req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },

  async loginRider(req: Request<unknown, unknown, LoginInput>, res: Response, next: NextFunction) {
    try {
      const result = await authService.login(req.body.email, req.body.password, "rider");
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async loginDriver(req: Request<unknown, unknown, LoginInput>, res: Response, next: NextFunction) {
    try {
      const result = await authService.login(req.body.email, req.body.password, "driver");
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async loginOwner(req: Request<unknown, unknown, LoginInput>, res: Response, next: NextFunction) {
    try {
      const result = await authService.ownerLogin(req.body.email, req.body.password);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};
