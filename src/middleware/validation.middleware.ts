import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";
import { BadRequestError } from "../utils/errors";

/**
 * Validates and replaces req.body with the parsed (typed) result.
 * Keeps zod schemas as the single source of truth for both validation
 * and the TypeScript type of req.body inside controllers.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; ");
      return next(new BadRequestError(message));
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join(".") || "query"}: ${issue.message}`)
        .join("; ");
      return next(new BadRequestError(message));
    }
    // Express typings mark req.query as read-only-ish; cast to assign the parsed object.
    (req as unknown as { query: T }).query = result.data;
    next();
  };
}
