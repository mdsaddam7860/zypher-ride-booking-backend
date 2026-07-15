import { z } from "zod";
import { latLngSchema } from "./common.validator";

export const vehicleTypeSchema = z.enum(["2_wheeler", "3_wheeler", "4_seater", "7_seater"]);

export const createFareSchema = z.object({
  pickupLocation: latLngSchema,
  pickupAddress: z.string().max(500).optional(),
  destination: latLngSchema,
  destinationAddress: z.string().max(500).optional(),
  vehicleType: vehicleTypeSchema,
});
export type CreateFareInput = z.infer<typeof createFareSchema>;