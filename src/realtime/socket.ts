import { Server as HttpServer } from "http";
import { Server as SocketIoServer, Socket } from "socket.io";
import { verifyToken } from "../utils/jwt";
import { JwtPayload } from "../types";
import { logger } from "../utils/logger";

declare module "socket.io" {
  interface Socket {
    user?: JwtPayload;
  }
}

let io: SocketIoServer | undefined;

/**
 * Room naming convention:
 *  - `driver:{driverId}`  — a specific driver's own socket(s). Used to push
 *    `ride:offer` / `ride:offer:expired` / `ride:offer:superseded`.
 *  - `rider:{riderId}`    — a specific rider's own socket(s). Used to push
 *    live ride-status updates instead of polling.
 *  - `ride:{rideId}`      — anyone currently watching a specific ride (owner
 *    dashboard, or rider/driver detail screen) — optional, joined on demand.
 *
 * This module is intentionally the *only* place that touches `io` directly.
 * Callers (dispatch.service.ts etc.) go through `emitToDriver`/`emitToRider`
 * below rather than importing socket.io themselves — that's the seam that
 * makes it easy to swap in the Redis adapter later (only this file and
 * `offerTimeoutStore.ts` need to change, nothing upstream).
 */
export function initSocketServer(httpServer: HttpServer): SocketIoServer {
  io = new SocketIoServer(httpServer, {
    cors: { origin: "*" }, // tighten to your actual frontend origin(s) in production
  });

  io.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token ??
      (socket.handshake.headers.authorization?.startsWith("Bearer ")
        ? socket.handshake.headers.authorization.slice("Bearer ".length)
        : undefined);

    if (!token) return next(new Error("Missing auth token"));

    try {
      socket.user = verifyToken(token);
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = socket.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    if (user.role === "driver") socket.join(`driver:${user.userId}`);
    if (user.role === "rider") socket.join(`rider:${user.userId}`);
    if (user.role === "owner") socket.join("owner-dashboard");

    logger.info("Socket connected", { userId: user.userId, role: user.role });

    // Optional: client can ask to watch a specific ride's room for live updates.
    socket.on("ride:watch", (rideId: string) => {
      if (typeof rideId === "string") socket.join(`ride:${rideId}`);
    });

    socket.on("disconnect", () => {
      logger.info("Socket disconnected", { userId: user.userId, role: user.role });
    });
  });

  return io;
}

function getIo(): SocketIoServer {
  if (!io) throw new Error("Socket.io server not initialized — call initSocketServer() first");
  return io;
}

export function emitToDriver(driverId: string, event: string, payload: unknown): void {
  getIo().to(`driver:${driverId}`).emit(event, payload);
}

export function emitToRider(riderId: string, event: string, payload: unknown): void {
  getIo().to(`rider:${riderId}`).emit(event, payload);
}

export function emitToOwners(event: string, payload: unknown): void {
  getIo().to("owner-dashboard").emit(event, payload);
}

export function emitToRideWatchers(rideId: string, event: string, payload: unknown): void {
  getIo().to(`ride:${rideId}`).emit(event, payload);
}
