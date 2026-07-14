import { z } from "zod";

export const submitDriverDocumentsSchema = z
  .object({
    aadharNumber: z.string().min(4).max(20).optional(),
    aadharPhotoUrl: z.string().url().optional(),
    licenseNumber: z.string().min(4).max(50).optional(),
    licenseExpiry: z.coerce.date().optional(),
    licensePhotoUrl: z.string().url().optional(),
    vehicleRegistrationNumber: z.string().min(4).max(20).optional(),
    vehicleModel: z.string().max(100).optional(),
    vehiclePhotoUrl: z.string().url().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });
export type SubmitDriverDocumentsInput = z.infer<typeof submitDriverDocumentsSchema>;

export const verifyDriverDocumentsSchema = z.object({
  isVerified: z.boolean(),
});
export type VerifyDriverDocumentsInput = z.infer<typeof verifyDriverDocumentsSchema>;