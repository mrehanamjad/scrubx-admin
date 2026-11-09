"use server";

import { revalidatePath } from "next/cache";
import { createSafeAction } from "../server/action-client.ts";
import { staffService } from "../server/services/staff.service.ts";
import {
  inviteStaffSchema,
  updateStaffRoleSchema,
  banStaffSchema,
  unbanStaffSchema,
  staffFilterSchema,
} from "../server/validation/staff.ts";

/**
 * Server Action: List all administrative staff accounts.
 * Strictly requires super_admin privileges.
 */
export const getStaffListAction = createSafeAction(
  {
    schema: staffFilterSchema,
    requiredRole: "super_admin",
  },
  async ({ input, admin }) => {
    return staffService.listStaff(input, admin);
  }
);

/**
 * Server Action: Invite / create new staff account with random one-time password.
 * Strictly requires super_admin privileges.
 */
export const inviteStaffAction = createSafeAction(
  {
    schema: inviteStaffSchema,
    requiredRole: "super_admin",
  },
  async ({ input, admin }) => {
    const result = await staffService.inviteStaff(input, admin);
    revalidatePath("/staff");
    return result;
  }
);

/**
 * Server Action: Update role for an administrative staff member.
 * Strictly requires super_admin privileges.
 */
export const updateStaffRoleAction = createSafeAction(
  {
    schema: updateStaffRoleSchema,
    requiredRole: "super_admin",
  },
  async ({ input, admin }) => {
    const updated = await staffService.updateStaffRole(input, admin);
    revalidatePath("/staff");
    return updated;
  }
);

/**
 * Server Action: Suspend / ban a staff member and invalidate all active sessions.
 * Strictly requires super_admin privileges.
 */
export const banStaffAction = createSafeAction(
  {
    schema: banStaffSchema,
    requiredRole: "super_admin",
  },
  async ({ input, admin }) => {
    const updated = await staffService.banStaff(input, admin);
    revalidatePath("/staff");
    return updated;
  }
);

/**
 * Server Action: Reactivate / unban a staff account.
 * Strictly requires super_admin privileges.
 */
export const unbanStaffAction = createSafeAction(
  {
    schema: unbanStaffSchema,
    requiredRole: "super_admin",
  },
  async ({ input, admin }) => {
    const updated = await staffService.unbanStaff(input, admin);
    revalidatePath("/staff");
    return updated;
  }
);
