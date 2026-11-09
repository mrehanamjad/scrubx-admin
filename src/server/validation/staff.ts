import { z } from "zod";

export const adminRoleEnum = z.enum(["super_admin", "admin", "staff"]);

export const inviteStaffSchema = z.object({
  email: z.string().trim().email("Valid email address is required."),
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(100),
  role: adminRoleEnum.default("staff"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters long.")
    .max(128)
    .optional(),
});

export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;

export const updateStaffRoleSchema = z.object({
  userId: z.string().trim().min(1, "User ID is required."),
  role: adminRoleEnum,
});

export type UpdateStaffRoleInput = z.infer<typeof updateStaffRoleSchema>;

export const banStaffSchema = z.object({
  userId: z.string().trim().min(1, "User ID is required."),
  reason: z.string().trim().min(3, "Reason must be at least 3 characters.").max(500),
});

export type BanStaffInput = z.infer<typeof banStaffSchema>;

export const unbanStaffSchema = z.object({
  userId: z.string().trim().min(1, "User ID is required."),
});

export type UnbanStaffInput = z.infer<typeof unbanStaffSchema>;

export const staffFilterSchema = z.object({
  q: z.string().trim().optional(),
  role: adminRoleEnum.optional(),
  banned: z.boolean().optional(),
});

export type StaffFilterInput = z.infer<typeof staffFilterSchema>;
