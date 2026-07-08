import { NextFunction, Request, Response } from "express";
import { verifyToken } from "../utils/jwt";
import { Role } from "../types";
import { UnauthorizedError, ForbiddenError } from "../utils/errors";

/**
 * Verifies the JWT if present and attaches req.user.
 * Does NOT reject requests without a token — use `requireAuth` for that.
 * Useful for endpoints like POST /fares that work with or without login.
 */
export function attachUserIfPresent(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();

  try {
    req.user = verifyToken(header.slice("Bearer ".length));
  } catch {
    // Invalid/expired token on an optional-auth route: ignore and proceed unauthenticated.
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new UnauthorizedError("Missing bearer token"));
  }

  try {
    req.user = verifyToken(header.slice("Bearer ".length));
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired token"));
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError(`Requires role: ${roles.join(" or ")}`));
    }
    next();
  };
}
