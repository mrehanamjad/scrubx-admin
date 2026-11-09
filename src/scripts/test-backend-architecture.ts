import fs from "node:fs";

// Load environment variables for local testing
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
} else if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

import { z } from "zod";
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  ConflictError,
  toActionError,
} from "../server/errors.ts";
import {
  hasMinimumRole,
  assertRole,
  type AdminContext,
} from "../server/auth.ts";
import {
  uuidSchema,
  slugSchema,
  pricePkrSchema,
  quantitySchema,
  paginationSchema,
  dateRangeSchema,
  fileUploadMetaSchema,
} from "../server/validation/common.ts";
import { updateStoreSettingSchema } from "../server/validation/settings.ts";
import { createSafeAction } from "../server/action-client.ts";
import { settingsRepository } from "../server/repositories/settings.repository.ts";
import { settingsService } from "../server/services/settings.service.ts";
import { db } from "../db/index.ts";
import { baUser } from "../db/schema/auth.ts";
import { eq } from "drizzle-orm";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
    failed++;
  }
}

async function runBackendTests() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(" 🏗️  ScrubX Backend Architecture & Data Access Test Suite");
  console.log("═══════════════════════════════════════════════════════════\n");

  // =========================================================================
  // 1. Validation Schemas Suite
  // =========================================================================
  console.log("Category 1: Zod Validation Schemas");

  // 1.1 UUID validation
  const validUuid = "123e4567-e89b-12d3-a456-426614174000";
  assert(uuidSchema.safeParse(validUuid).success, "UUID schema accepts valid RFC UUID");
  assert(!uuidSchema.safeParse("not-a-uuid").success, "UUID schema rejects malformed identifier");

  // 1.2 Slug validation
  assert(slugSchema.safeParse("womens-scrub-top").success, "Slug schema accepts kebab-case");
  assert(!slugSchema.safeParse("Invalid Slug!").success, "Slug schema rejects spaces and uppercase");

  // 1.3 Price PKR validation
  assert(pricePkrSchema.safeParse(2450.50).success, "Price schema accepts positive decimal PKR");
  assert(pricePkrSchema.safeParse("1800").success, "Price schema coerces string number");
  assert(!pricePkrSchema.safeParse(-50).success, "Price schema rejects negative value");
  assert(!pricePkrSchema.safeParse(12.345).success, "Price schema rejects more than 2 decimal places");

  // 1.4 Quantity validation
  assert(quantitySchema.safeParse(15).success, "Quantity schema accepts whole integer");
  assert(!quantitySchema.safeParse(3.5).success, "Quantity schema rejects fractional number");
  assert(!quantitySchema.safeParse(-2).success, "Quantity schema rejects negative stock");

  // 1.5 Pagination defaults & limits
  const parsedPagination = paginationSchema.parse({});
  assert(parsedPagination.page === 1 && parsedPagination.limit === 20, "Pagination defaults to page 1, limit 20");
  assert(!paginationSchema.safeParse({ limit: 150 }).success, "Pagination caps maximum limit at 100");

  // 1.6 Date Range Invariants
  assert(
    dateRangeSchema.safeParse({ from: "2026-01-01", to: "2026-01-10" }).success,
    "Date range accepts chronological dates"
  );
  assert(
    !dateRangeSchema.safeParse({ from: "2026-01-10", to: "2026-01-01" }).success,
    "Date range rejects inverted dates (from > to)"
  );

  // 1.7 File Upload Metadata
  assert(
    fileUploadMetaSchema.safeParse({
      fileName: "scrub-top.jpg",
      size: 2 * 1024 * 1024,
      mimeType: "image/jpeg",
      folder: "/scrubx/products",
    }).success,
    "File metadata schema accepts valid image parameters"
  );
  assert(
    !fileUploadMetaSchema.safeParse({
      fileName: "malicious.exe",
      size: 1024,
      mimeType: "application/x-msdownload",
      folder: "/scrubx/products",
    }).success,
    "File metadata schema rejects disallowed MIME type"
  );

  // 1.8 Store Setting Specific Schema
  assert(
    updateStoreSettingSchema.safeParse({
      key: "payment_deadline_hours",
      value: 48,
    }).success,
    "Settings schema accepts integer for payment_deadline_hours"
  );
  assert(
    !updateStoreSettingSchema.safeParse({
      key: "payment_deadline_hours",
      value: "forty-eight",
    }).success,
    "Settings schema rejects string value for payment_deadline_hours"
  );

  // =========================================================================
  // 2. Error Handling & Security Sanitization
  // =========================================================================
  console.log("\nCategory 2: Error Handling & Sanitization");

  // 2.1 Custom App Errors
  const authErr = new AuthenticationError();
  assert(authErr.statusCode === 401 && authErr.code === "UNAUTHORIZED", "AuthenticationError returns 401 UNAUTHORIZED");

  const forbiddenErr = new AuthorizationError();
  assert(forbiddenErr.statusCode === 403 && forbiddenErr.code === "FORBIDDEN", "AuthorizationError returns 403 FORBIDDEN");

  const notFoundErr = new NotFoundError("Product", "prd_123");
  assert(notFoundErr.statusCode === 404 && notFoundErr.message.includes("prd_123"), "NotFoundError formats identifier");

  // 2.2 ZodError Mapping via toActionError
  try {
    uuidSchema.parse("invalid-uuid");
  } catch (err) {
    const serialized = toActionError(err);
    assert(serialized.code === "VALIDATION_ERROR", "toActionError formats ZodError with VALIDATION_ERROR code");
    assert(Boolean(serialized.fieldErrors?.root), "toActionError attaches structured fieldErrors map");
  }

  // 2.3 PostgreSQL Error Code Masking (23505 Unique Violation)
  const simulatedPgConflict = { code: "23505", detail: "Key (slug)=(blue-scrubs) already exists." };
  const sanitizedConflict = toActionError(simulatedPgConflict);
  assert(
    sanitizedConflict.code === "CONFLICT" && !sanitizedConflict.error.includes("Key (slug)"),
    "toActionError masks Postgres unique violation without leaking internal schema"
  );

  // 2.4 Generic Error Masking
  const genericErr = new Error("Database connection refused at 10.0.0.1:5432 with password secret123");
  const sanitizedGeneric = toActionError(genericErr);
  assert(
    sanitizedGeneric.code === "INTERNAL_SERVER_ERROR" && !sanitizedGeneric.error.includes("secret123"),
    "toActionError sanitizes unexpected exceptions and credentials"
  );

  // =========================================================================
  // 3. Authentication & Authorization Hierarchy
  // =========================================================================
  console.log("\nCategory 3: Authentication & Authorization Hierarchy");

  assert(hasMinimumRole("super_admin", "super_admin"), "super_admin satisfies super_admin");
  assert(hasMinimumRole("super_admin", "admin"), "super_admin satisfies admin");
  assert(hasMinimumRole("super_admin", "staff"), "super_admin satisfies staff");

  assert(!hasMinimumRole("admin", "super_admin"), "admin does NOT satisfy super_admin");
  assert(hasMinimumRole("admin", "admin"), "admin satisfies admin");
  assert(hasMinimumRole("admin", "staff"), "admin satisfies staff");

  assert(!hasMinimumRole("staff", "admin"), "staff does NOT satisfy admin");
  assert(hasMinimumRole("staff", "staff"), "staff satisfies staff");

  const staffAdmin: AdminContext = {
    id: "user_staff_01",
    email: "staff@scrubx.pk",
    name: "Staff Member",
    role: "staff",
  };

  // Find real seeded super_admin in database or fallback gracefully
  let realAdminId: string | undefined = undefined;
  try {
    const [dbUser] = await db
      .select({ id: baUser.id })
      .from(baUser)
      .where(eq(baUser.email, "admin@scrubx.pk"))
      .limit(1);
    if (dbUser) realAdminId = dbUser.id;
  } catch {}

  const superAdmin: AdminContext = {
    id: realAdminId || "user_admin_01",
    email: "admin@scrubx.pk",
    name: "Super Admin",
    role: "super_admin",
  };

  let threwForbidden = false;
  try {
    assertRole(staffAdmin, ["admin"]);
  } catch (err) {
    if (err instanceof AuthorizationError) threwForbidden = true;
  }
  assert(threwForbidden, "assertRole throws AuthorizationError when staff attempts admin action");

  let superAdminPassed = true;
  try {
    assertRole(superAdmin, ["admin"]);
  } catch {
    superAdminPassed = false;
  }
  assert(superAdminPassed, "assertRole allows super_admin to execute admin action");

  // =========================================================================
  // 4. Data Access Layer & Live Database Connectivity
  // =========================================================================
  console.log("\nCategory 4: Repositories & Database Operations");

  try {
    // 4.1 Database Healthcheck
    const health = await settingsRepository.checkDatabaseHealth();
    assert(health.healthy, "SettingsRepository.checkDatabaseHealth executes SELECT NOW() on PostgreSQL");

    // 4.2 Upsert & Retrieve Setting via Drizzle
    const testKey = "store_name" as const;
    const testValue = "ScrubX Pakistan Official Store";

    const upserted = await settingsRepository.upsertSetting(
      testKey,
      testValue,
      realAdminId
    );
    assert(upserted.key === testKey, "SettingsRepository.upsertSetting successfully upserts row");

    const retrieved = await settingsRepository.getSettingByKey(testKey);
    assert(retrieved === testValue, "SettingsRepository.getSettingByKey retrieves updated value", retrieved ?? undefined);

    // 4.3 Get All Settings
    const allSettings = await settingsRepository.getAllSettings();
    assert(Array.isArray(allSettings) && allSettings.length > 0, "SettingsRepository.getAllSettings returns rows array");
  } catch (dbErr: any) {
    console.error("  ❌ Database test failed:", dbErr?.message || dbErr);
    failed++;
  }

  // =========================================================================
  // 5. Services Layer & Business Rules
  // =========================================================================
  console.log("\nCategory 5: Business Services Layer");

  try {
    // 5.1 Staff reading settings
    const staffSettings = await settingsService.getAllSettings(staffAdmin);
    assert(typeof staffSettings === "object" && Boolean(staffSettings.store_name), "SettingsService.getAllSettings merges defaults for staff");

    // 5.2 Staff denied setting mutation
    let staffUpdateBlocked = false;
    try {
      await settingsService.updateSetting("store_name", "Illegal Rename", staffAdmin);
    } catch (err) {
      if (err instanceof AuthorizationError) staffUpdateBlocked = true;
    }
    assert(staffUpdateBlocked, "SettingsService.updateSetting blocks staff from updating configuration");

    // 5.3 Super Admin allowed setting mutation
    const adminUpdate = await settingsService.updateSetting("store_name", "ScrubX Pakistan", superAdmin);
    assert(adminUpdate.value === "ScrubX Pakistan", "SettingsService.updateSetting allows administrator to update configuration");
  } catch (srvErr: any) {
    console.error("  ❌ Service test failed:", srvErr?.message || srvErr);
    failed++;
  }

  // =========================================================================
  // 6. Action Pipeline (createSafeAction)
  // =========================================================================
  console.log("\nCategory 6: Action Pipeline (createSafeAction)");

  // Define a test action with schema validation and role requirement
  const testProtectedAction = createSafeAction(
    {
      schema: z.object({
        amount: pricePkrSchema,
        note: z.string().min(3),
      }),
      requiredRole: "staff",
    },
    async ({ input, admin }) => {
      return {
        confirmedAmount: input.amount,
        processedBy: admin.name,
      };
    }
  );

  // 6.1 Unauthenticated execution rejection (ARCH-003: no fabricated anonymous principal)
  const actionUnauth = await testProtectedAction({
    amount: 500,
    note: "Valid payment note",
  });
  assert(
    actionUnauth.success === false &&
      (actionUnauth.code === "UNAUTHORIZED" || actionUnauth.code === "AUTHENTICATION_ERROR"),
    "createSafeAction rejects unauthenticated invocation without session (ARCH-003)"
  );

  // 6.2 Zod validation rejection and structured fieldErrors serialization
  const actionSchema = z.object({
    amount: pricePkrSchema,
    note: z.string().min(3),
  });
  const parseResult = await actionSchema.safeParseAsync({
    amount: -100, // Invalid negative
    note: "ab", // Too short
  });
  assert(!parseResult.success, "Action schema rejects invalid negative price and short note");
  if (!parseResult.success) {
    const serialized = toActionError(parseResult.error);
    assert(
      serialized.code === "VALIDATION_ERROR" &&
        Boolean(serialized.fieldErrors?.amount && serialized.fieldErrors?.note),
      "toActionError formats validation errors with structured fieldErrors map"
    );
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(` Summary: ${passed} Passed, ${failed} Failed`);
  console.log("═══════════════════════════════════════════════════════════");

  if (failed > 0) {
    process.exit(1);
  }
}

runBackendTests().catch((err) => {
  console.error("Unexpected error running backend tests:", err);
  process.exit(1);
});
