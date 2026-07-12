import { Request, Response, NextFunction } from "express";
import { rideService } from "../services/ride.service";
import { fareService } from "../services/fare.service";
import { auditService } from "../services/audit.service";
import { paymentService } from "../services/payment.service";
import {
  CancelRideInput,
  CreateRideInput,
  DriverResponseInput,
  EditRideInput,
} from "../validators/ride.validator";
import { serializeRide } from "../utils/serializers";
import { ForbiddenError, UnauthorizedError } from "../utils/errors";
import { buildContact } from "../utils/contact";
import { RideStatus } from "../types";

export const rideController = {
  async create(req: Request<unknown, unknown, CreateRideInput>, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const ride = await rideService.requestRide({
        riderId: req.user.userId,
        fareId: req.body.fareId,
        scheduledStartAt: req.body.scheduledStartAt,
        paymentMethod: req.body.paymentMethod,
        notes: req.body.notes,
        bookingType: req.body.bookingType,
      });
      const fare = await fareService.getById(ride.fare_id);
      res.status(201).json(serializeRide(ride, { fare, viewerRole: "rider" }));
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const ride = await rideService.getById(req.params.id);
      await rideService.assertViewable(ride, req.user.userId, req.user.role);
      const fare = await fareService.getById(ride.fare_id);
      const contact = await buildContact(ride, req.user.role);
      res.status(200).json(serializeRide(ride, { fare, viewerRole: req.user.role, contact }));
    } catch (err) {
      next(err);
    }
  },

  // Owner-only edit of pickup/dropoff/vehicle_type/notes — only while unassigned.
  async edit(req: Request<{ id: string }, unknown, EditRideInput>, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const ride = await rideService.ownerEditRide(req.params.id, req.user.userId, req.body);
      const fare = await fareService.getById(ride.fare_id);
      const contact = await buildContact(ride, "owner");
      res.status(200).json(serializeRide(ride, { fare, viewerRole: "owner", contact }));
    } catch (err) {
      next(err);
    }
  },

  async cancel(req: Request<{ id: string }, unknown, CancelRideInput>, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const role = req.user.role;
      if (role !== "rider" && role !== "driver" && role !== "owner") throw new UnauthorizedError();

      const ride = await rideService.cancelRide(
        req.params.id,
        { userId: req.user.userId, role },
        req.body.reason
      );
      const fare = await fareService.getById(ride.fare_id);
      const contact = await buildContact(ride, role);
      res.status(200).json(serializeRide(ride, { fare, viewerRole: role, contact }));
    } catch (err) {
      next(err);
    }
  },

  // Driver accept/deny of an assigned ride.
  async respond(
    req: Request<{ id: string }, unknown, DriverResponseInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const ride = await rideService.respondToAssignment(req.params.id, req.user.userId, req.body.action);
      const fare = await fareService.getById(ride.fare_id);
      const contact = await buildContact(ride, "driver");
      res.status(200).json(serializeRide(ride, { fare, viewerRole: "driver", contact }));
    } catch (err) {
      next(err);
    }
  },

  // Driver marks themselves as having reached the pickup point — notifies the rider.
  async arrive(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const ride = await rideService.markArrived(req.params.id, req.user.userId);
      const fare = await fareService.getById(ride.fare_id);
      const contact = await buildContact(ride, "driver");
      res.status(200).json(serializeRide(ride, { fare, viewerRole: "driver", contact }));
    } catch (err) {
      next(err);
    }
  },

  async start(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const ride = await rideService.startRide(req.params.id, req.user.userId);
      const fare = await fareService.getById(ride.fare_id);
      const contact = await buildContact(ride, "driver");
      res.status(200).json(serializeRide(ride, { fare, viewerRole: "driver", contact }));
    } catch (err) {
      next(err);
    }
  },

  async complete(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const ride = await rideService.completeRide(req.params.id, req.user.userId);
      const fare = await fareService.getById(ride.fare_id);
      const contact = await buildContact(ride, "driver");
      res.status(200).json(serializeRide(ride, { fare, viewerRole: "driver", contact }));
    } catch (err) {
      next(err);
    }
  },

  // Rider confirms/pays their advance-payment order.
  async pay(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const payment = await paymentService.confirmPayment(req.params.id, req.user.userId);
      res.status(200).json({
        paymentId: payment.id,
        rideId: payment.ride_id,
        amount: Number(payment.amount),
        currency: payment.currency,
        status: payment.status,
      });
    } catch (err) {
      next(err);
    }
  },

  // All rides for the caller — rider/driver see their own, owner sees all.
  // Optional ?status= filter (e.g. ?status=completed).
  async history(req: Request<unknown, unknown, unknown, { status?: string }>, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const statusFilter = req.query.status as RideStatus | undefined;
      const rides = await rideService.listHistory(req.user.userId, req.user.role, statusFilter);
      const withFares = await Promise.all(
        rides.map(async (ride) => {
          const fare = await fareService.getById(ride.fare_id);
          const contact = await buildContact(ride, req.user!.role);
          return serializeRide(ride, { fare, viewerRole: req.user!.role, contact });
        })
      );
      res.status(200).json(withFares);
    } catch (err) {
      next(err);
    }
  },

  // Owner and admin only — no admin role exists in this system today, so
  // this is restricted to "owner".
  async audit(req: Request<{ rideId: string }>, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      if (req.user.role !== "owner") throw new ForbiddenError("Owner only");
      const trail = await auditService.getTrail(req.params.rideId);
      res.status(200).json(
        trail.map((entry) => ({
          id: entry.id,
          action: entry.action,
          changedBy: { id: entry.actor_id, role: entry.actor_role },
          changes: entry.changes,
          at: entry.created_at,
        }))
      );
    } catch (err) {
      next(err);
    }
  },
};