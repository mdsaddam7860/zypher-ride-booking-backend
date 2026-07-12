import { z } from "zod";

export const updateProfileSchema = z
  .object({
    name: z.string().min(1).max(150).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(6).max(20).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;