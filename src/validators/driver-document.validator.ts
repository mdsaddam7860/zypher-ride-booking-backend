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

export const verifyDriverDocumentsSchema = z
  .object({
    isVerified: z.boolean(),
    rejectionReason: z.string().min(1).max(500).optional(),
  })
  .refine((data) => data.isVerified || (data.rejectionReason && data.rejectionReason.length > 0), {
    message: "rejectionReason is required when rejecting a driver's documents",
    path: ["rejectionReason"],
  });
export type VerifyDriverDocumentsInput = z.infer<typeof verifyDriverDocumentsSchema>;