import { z } from "zod";

export const assignDriverSchema = z.object({
  driverId: z.string().uuid(),
});
export type AssignDriverInput = z.infer<typeof assignDriverSchema>;

export const nearbyDriversQuerySchema = z.object({
  rideId: z.string().uuid(),
});
export type NearbyDriversQuery = z.infer<typeof nearbyDriversQuerySchema>;

export const listRidesQuerySchema = z.object({
  status: z
    .enum([
      "pending_assignment",
      "driver_assigned",
      "driver_accepted",
      "in_progress",
      "completed",
      "cancelled",
    ])
    .optional(),
});
export type ListRidesQuery = z.infer<typeof listRidesQuerySchema>;

// GET /api/owner/fares — browse fare estimates (rate-management / audit view).
export const listFaresQuerySchema = z.object({
  vehicleType: z.enum(["4_seater", "7_seater"]).optional(),
  riderId: z.string().uuid().optional(),
  // Only fares that were actually turned into a ride vs raw estimates never booked.
  bookedOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListFaresQuery = z.infer<typeof listFaresQuerySchema>;