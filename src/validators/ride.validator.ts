import { z } from "zod";
import { latLngSchema } from "./common.validator";
import { vehicleTypeSchema } from "./fare.validator";

export const createRideSchema = z.object({
  fareId: z.string().uuid(),
  // Rider books in advance; must be in the future (checked in the service).
  scheduledStartAt: z.coerce.date(),
  paymentMethod: z.enum(["cash", "advance"]).default("cash"),
  notes: z.string().max(1000).optional(),
});
export type CreateRideInput = z.infer<typeof createRideSchema>;

export const driverResponseSchema = z.object({
  action: z.enum(["accept", "deny"]),
});
export type DriverResponseInput = z.infer<typeof driverResponseSchema>;

export const cancelRideSchema = z.object({
  reason: z.string().max(255).optional(),
});
export type CancelRideInput = z.infer<typeof cancelRideSchema>;

// Owner-only edit. vehicle_type is editable by the owner (dispatch correction)
// even though the rider themselves can never change it after creation.
export const editRideSchema = z
  .object({
    pickup: latLngSchema.optional(),
    dropoff: latLngSchema.optional(),
    vehicleType: vehicleTypeSchema.optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });
export type EditRideInput = z.infer<typeof editRideSchema>;
