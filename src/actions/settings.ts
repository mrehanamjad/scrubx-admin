"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/index.ts";
import { notificationReads } from "../db/schema/notifications.ts";
import { createSafeAction } from "../server/action-client.ts";
import { settingsService } from "../server/services/settings.service.ts";
import {
  updateStoreSettingSchema,
  getStoreSettingSchema,
  batchUpdateStoreSettingsSchema,
} from "../server/validation/settings.ts";

/**
 * Server Action: Retrieve all store settings.
 * Enforces staff role authorization.
 */
export const getStoreSettingsAction = createSafeAction(
  {
    requiredRole: "staff",
  },
  async ({ admin }) => {
    return settingsService.getAllSettings(admin);
  }
);

/**
 * Server Action: Retrieve a single store setting by key.
 * Validates key using getStoreSettingSchema, enforces staff role.
 */
export const getStoreSettingByKeyAction = createSafeAction(
  {
    schema: getStoreSettingSchema,
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    return settingsService.getSetting(input.key as any, admin);
  }
);

/**
 * Server Action: Update a store setting.
 * Validates payload with updateStoreSettingSchema, strictly enforces super_admin role (SEC-013),
 * and revalidates the /settings route cache.
 */
export const updateStoreSettingAction = createSafeAction(
  {
    schema: updateStoreSettingSchema,
    requiredRole: "super_admin",
  },
  async ({ input, admin }) => {
    const updated = await settingsService.updateSetting(
      input.key as any,
      input.value as any,
      admin
    );

    revalidatePath("/settings");

    return updated;
  }
);

/**
 * Server Action: Batch update store settings from the admin settings form.
 * Strictly enforces super_admin role authorization (SEC-013), runs atomically in a transaction,
 * and revalidates the /settings route cache.
 */
export const updateStoreSettingsBatchAction = createSafeAction(
  {
    schema: batchUpdateStoreSettingsSchema,
    requiredRole: "super_admin",
  },
  async ({ input, admin }) => {
    const updated = await settingsService.updateSettingsBatch(input as any, admin);
    revalidatePath("/settings");
    return updated;
  }
);

/**
 * Server Action: Live database connection health query.
 * Enforces staff role authorization.
 */
export const getDatabaseHealthAction = createSafeAction(
  {
    requiredRole: "staff",
  },
  async ({ admin }) => {
    return settingsService.getHealthStatus(admin);
  }
);

/**
 * Server Action: Mark an operational notification as read for the current operator (ECOM-011).
 * Idempotently records into notification_reads.
 * Requires at least staff role.
 */
export const markNotificationReadAction = createSafeAction(
  {
    schema: z.object({
      key: z.string().trim().min(1),
    }),
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    await db
      .insert(notificationReads)
      .values({
        userId: admin.id,
        notificationKey: input.key,
        readAt: new Date(),
      })
      .onConflictDoNothing();
    return { success: true };
  }
);
