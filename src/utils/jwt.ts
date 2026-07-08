import jwt, { SignOptions } from "jsonwebtoken";
import { config } from "../config";
import { JwtPayload } from "../types";

export function signToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: config.jwt.expiresIn as SignOptions["expiresIn"] };
  return jwt.sign(payload, config.jwt.secret, options);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwt.secret) as JwtPayload;
}
