import { settingsRepository, SettingsRepository } from "../repositories/settings.repository.ts";
import { assertRole, type AdminContext } from "../auth.ts";
import { db } from "../../db/index.ts";
import { ValidationError } from "../errors.ts";
import { storeSettingsValueSchemas } from "../../db/schema/json-schemas.ts";
import type { StoreSettingKey, StoreSettingsMap } from "../../db/schema/json-types.ts";
import type { DatabaseExecutor } from "../repositories/base.repository.ts";
import { validateStoreSetting } from "../../lib/store-settings-registry.ts";
import { recordAuditLog } from "../audit.ts";

// Default settings dictionary if database has not yet been seeded with rows
const DEFAULT_SETTINGS: Partial<StoreSettingsMap> = {
  store_name: "ScrubX Pakistan",
  tagline: "Medical Scrubs & Professional Uniforms",
  whatsapp_number: "+92 300 1234567",
  payment_deadline_hours: 24,
  support_email: "support@scrubx.pk",
  support_phone: "+92 42 35789000",
  city: "Lahore",
  province: "Punjab",
  postal_code: "54000",
  currency: "PKR",
  address: "Building 14-B, Sector C, DHA Phase 5",
  order_confirmation_auto: true,
  low_stock_alerts: true,
  new_order_email: true,
  new_order_whatsapp: true,
  payment_submitted_alert: true,
  daily_summary: false,
};

export class SettingsService {
  private readonly repo: SettingsRepository;

  constructor(repo: SettingsRepository = settingsRepository) {
    this.repo = repo;
  }

  /**
   * Retrieves all store settings as a key-value mapping.
   * Requires at least staff privileges.
   */
  async getAllSettings(
    admin: AdminContext,
    executor: DatabaseExecutor = db
  ): Promise<Partial<StoreSettingsMap>> {
    assertRole(admin, ["staff"]);

    const rows = await this.repo.getAllSettings(executor);
    const result: Partial<StoreSettingsMap> = { ...DEFAULT_SETTINGS };

    for (const row of rows) {
      (result as any)[row.key] = row.value;
    }

    return result;
  }

  /**
   * Retrieves a single store setting by key.
   * Requires at least staff privileges.
   */
  async getSetting<K extends StoreSettingKey>(
    key: K,
    admin: AdminContext
  ): Promise<StoreSettingsMap[K] | null> {
    assertRole(admin, ["staff"]);

    const val = await this.repo.getSettingByKey(key);
    if (val !== null) {
      return val;
    }

    return (DEFAULT_SETTINGS[key] as StoreSettingsMap[K]) ?? null;
  }

  /**
   * Updates a single store setting.
   * Strictly requires Super Administrator (super_admin) privileges (SEC-013).
   */
  async updateSetting<K extends StoreSettingKey>(
    key: K,
    value: StoreSettingsMap[K],
    admin: AdminContext
  ) {
    assertRole(admin, ["super_admin"]);

    const validation = validateStoreSetting(key, value, { allowUnknown: true });
    if (!validation.valid) {
      throw new ValidationError(validation.error || `Invalid value for setting '${key}'`);
    }

    const previousValue = await this.repo.getSettingByKey(key);
    const updated = await this.repo.upsertSetting(key, value, admin.id);

    await recordAuditLog({
      admin,
      action: "store_setting.update",
      entityType: "store_setting",
      entityId: key,
      before: previousValue !== null ? { [key]: previousValue } : null,
      after: { [key]: value },
      metadata: { key },
    });

    return {
      key: updated.key as K,
      value: updated.value as StoreSettingsMap[K],
      updatedAt: updated.updatedAt,
      updatedBy: updated.updatedBy,
    };
  }

  /**
   * Atomically updates multiple store settings in a single transaction.
   * Strictly requires Super Administrator (super_admin) privileges (SEC-013).
   */
  async updateSettingsBatch(
    settings: Partial<StoreSettingsMap>,
    admin: AdminContext
  ): Promise<Partial<StoreSettingsMap>> {
    assertRole(admin, ["super_admin"]);

    const entriesToUpsert: Array<{ key: StoreSettingKey; value: any; updatedById?: string }> = [];

    for (const [rawKey, rawVal] of Object.entries(settings)) {
      if (rawVal === undefined) continue;

      const key = rawKey as StoreSettingKey;
      const validator = storeSettingsValueSchemas[key as keyof typeof storeSettingsValueSchemas];

      if (!validator) {
        throw new ValidationError(`Unknown store setting key: '${rawKey}'`);
      }

      const parseRes = validator.safeParse(rawVal);
      if (!parseRes.success) {
        throw new ValidationError(
          `Invalid value for setting '${rawKey}': ${parseRes.error.issues.map((i) => i.message).join(", ")}`
        );
      }

      const regValidation = validateStoreSetting(key, rawVal, { allowUnknown: true });
      if (!regValidation.valid) {
        throw new ValidationError(regValidation.error || `Invalid value for setting '${key}'`);
      }

      entriesToUpsert.push({
        key,
        value: parseRes.data,
        updatedById: admin.id,
      });
    }

    if (entriesToUpsert.length === 0) {
      return this.getAllSettings(admin);
    }

    const result = await db.transaction(async (tx) => {
      await this.repo.upsertSettingsBatch(entriesToUpsert, tx);
      return this.getAllSettings(admin, tx);
    });

    await recordAuditLog({
      admin,
      action: "store_settings.batch_update",
      entityType: "store_settings",
      entityId: "batch",
      after: settings,
      metadata: { keys: entriesToUpsert.map((e) => e.key) },
    });

    return result;
  }

  /**
   * Returns PostgreSQL database health status and current timestamp.
   * Requires at least staff privileges.
   */
  async getHealthStatus(admin: AdminContext) {
    assertRole(admin, ["staff"]);
    return this.repo.checkDatabaseHealth();
  }
}

export const settingsService = new SettingsService();
