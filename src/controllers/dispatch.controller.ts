import { Request, Response, NextFunction } from "express";
import { dispatchService } from "../services/dispatch.service";
import { fareService } from "../services/fare.service";
import { serializeRide } from "../utils/serializers";
import { buildContact } from "../utils/contact";
import { UnauthorizedError } from "../utils/errors";
import { DispatchOfferResponseInput } from "../validators/ride.validator";

export const dispatchController = {
  // POST /api/rides/offers/:offerId/respond — driver accepts/declines an
  // auto-dispatch offer sent to them.
  async respond(
    req: Request<{ offerId: string }, unknown, DispatchOfferResponseInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const ride = await dispatchService.respondToOffer(req.params.offerId, req.user.userId, req.body.action);

      if (!ride) {
        // Declined — nothing further to return, dispatch has moved (or is
        // moving) on to the next driver in the background.
        res.status(200).json({ message: "Offer declined" });
        return;
      }

      const fare = await fareService.getById(ride.fare_id);
      const contact = await buildContact(ride, "driver");
      res.status(200).json(serializeRide(ride, { fare, viewerRole: "driver", contact }));
    } catch (err) {
      next(err);
    }
  },
};
