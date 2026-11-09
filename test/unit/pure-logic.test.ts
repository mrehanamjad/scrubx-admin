import { describe, it, expect } from "vitest";
import {
  formatPKR,
  formatDate,
  formatDateShort,
  formatDateTime,
  relativeTime,
  formatRelativeTime,
} from "../../src/lib/format.ts";
import { can, CAPABILITIES } from "../../src/lib/permissions.ts";
import { assertRole, hasMinimumRole, type AdminRole, type AdminContext } from "../../src/server/auth.ts";
import {
  validateStoreSetting,
  IBAN_REGEX,
  PHONE_REGEX,
  CURRENCY_REGEX,
} from "../../src/lib/store-settings-registry.ts";
import {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthorizationError,
  AuthenticationError,
} from "../../src/server/errors.ts";
import { safeInternalPath } from "../../src/lib/safe-redirect.ts";
import { inviteStaffSchema, updateStaffRoleSchema } from "../../src/server/validation/staff.ts";
import { addCustomerNoteSchema } from "../../src/server/validation/customers.ts";

describe("TEST-001: Pure Logic & Formatters Unit Suite", () => {
  describe("Formatting Functions (src/lib/format.ts)", () => {
    it("formats PKR currency accurately with default formatting", () => {
      expect(formatPKR(4500)).toBe("Rs. 4,500");
      expect(formatPKR(12500)).toBe("Rs. 12,500");
      expect(formatPKR(0)).toBe("Rs. 0");
    });

    it("formats PKR currency with compact mode", () => {
      expect(formatPKR(150000, { compact: true })).toBe("Rs. 150k");
      expect(formatPKR(2500000, { compact: true })).toBe("Rs. 2500k");
    });

    it("formats relative times cleanly", () => {
      const now = new Date();
      expect(formatRelativeTime(now)).toMatch(/seconds? ago|just now|0 seconds ago/i);

      const pastMinutes = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatRelativeTime(pastMinutes)).toMatch(/5 minutes ago/i);

      const pastHours = new Date(Date.now() - 3 * 3600 * 1000);
      expect(formatRelativeTime(pastHours)).toMatch(/3 hours ago/i);
    });

    it("formats dates and datetimes reliably", () => {
      const iso = "2026-11-09T10:00:00.000Z";
      expect(formatDate(iso)).toBeTruthy();
      expect(formatDateShort(iso)).toBeTruthy();
      expect(formatDateTime(iso)).toBeTruthy();
    });
  });

  describe("UI Capabilities & Server RBAC (src/lib/permissions.ts & auth.ts)", () => {
    it("evaluates UI permissions matrix (can)", () => {
      expect(can("super_admin", "settings:write")).toBe(true);
      expect(can("admin", "settings:write")).toBe(false);
      expect(can("staff", "settings:write")).toBe(false);

      expect(can("admin", "product:write")).toBe(true);
      expect(can("staff", "product:write")).toBe(false);

      expect(can("staff", "order:note")).toBe(true);
      expect(can(null, "order:note")).toBe(false);
      expect(can(undefined, "order:note")).toBe(false);
    });

    it("evaluates server role hierarchy (hasMinimumRole)", () => {
      expect(hasMinimumRole("super_admin", "super_admin")).toBe(true);
      expect(hasMinimumRole("super_admin", "admin")).toBe(true);
      expect(hasMinimumRole("super_admin", "staff")).toBe(true);

      expect(hasMinimumRole("admin", "super_admin")).toBe(false);
      expect(hasMinimumRole("admin", "admin")).toBe(true);
      expect(hasMinimumRole("admin", "staff")).toBe(true);

      expect(hasMinimumRole("staff", "admin")).toBe(false);
      expect(hasMinimumRole("staff", "staff")).toBe(true);
    });

    it("asserts server roles strictly with assertRole", () => {
      const staffUser: AdminContext = {
        id: "user-1",
        name: "Staff",
        email: "staff@scrubx.pk",
        role: "staff",
      };
      const superAdminUser: AdminContext = {
        id: "user-2",
        name: "Super Admin",
        email: "admin@scrubx.pk",
        role: "super_admin",
      };

      // Staff allowed on staff actions
      expect(() => assertRole(staffUser, ["staff"])).not.toThrow();

      // Staff forbidden on super_admin actions
      expect(() => assertRole(staffUser, ["super_admin"])).toThrow(AuthorizationError);

      // Super admin allowed everywhere
      expect(() => assertRole(superAdminUser, ["staff"])).not.toThrow();
      expect(() => assertRole(superAdminUser, ["admin"])).not.toThrow();
      expect(() => assertRole(superAdminUser, ["super_admin"])).not.toThrow();
    });
  });

  describe("Storefront Settings Registry (src/lib/store-settings-registry.ts)", () => {
    it("validates Pakistani phone numbers strictly", () => {
      expect(PHONE_REGEX.test("+923001234567")).toBe(true);
      expect(PHONE_REGEX.test("03001234567")).toBe(true);
      expect(PHONE_REGEX.test("12345")).toBe(false);
      expect(PHONE_REGEX.test("+14155552671")).toBe(false);
    });

    it("validates Pakistani IBANs strictly", () => {
      expect(IBAN_REGEX.test("PK36SCBL0000001123456701")).toBe(true);
      expect(IBAN_REGEX.test("GB82WEST12345698765432")).toBe(false);
    });

    it("validates currency codes strictly", () => {
      expect(CURRENCY_REGEX.test("PKR")).toBe(true);
      expect(CURRENCY_REGEX.test("USD")).toBe(true);
      expect(CURRENCY_REGEX.test("pkr")).toBe(false);
      expect(CURRENCY_REGEX.test("PK")).toBe(false);
    });

    it("validates setting values against registry specifications", () => {
      expect(validateStoreSetting("store_name", "ScrubX PK").valid).toBe(true);
      expect(validateStoreSetting("store_name", "A").valid).toBe(false);

      expect(validateStoreSetting("payment_deadline_hours", 24).valid).toBe(true);
      expect(validateStoreSetting("payment_deadline_hours", 200).valid).toBe(false);
      expect(validateStoreSetting("payment_deadline_hours", "24").valid).toBe(false);

      expect(validateStoreSetting("order_confirmation_auto", true).valid).toBe(true);
      expect(validateStoreSetting("order_confirmation_auto", "yes").valid).toBe(false);
    });
  });

  describe("Application Domain Errors (src/server/errors.ts)", () => {
    it("assigns appropriate HTTP status codes", () => {
      expect(new ValidationError("bad input").statusCode).toBe(400);
      expect(new AuthenticationError("not logged in").statusCode).toBe(401);
      expect(new AuthorizationError("forbidden").statusCode).toBe(403);
      expect(new NotFoundError("Product", "123").statusCode).toBe(404);
      expect(new ConflictError("already exists").statusCode).toBe(409);
    });
  });

  describe("Open Redirect Mitigation (src/lib/safe-redirect.ts)", () => {
    it("permits safe same-origin internal paths", () => {
      expect(safeInternalPath("/orders")).toBe("/orders");
      expect(safeInternalPath("/products/123?tab=inventory")).toBe("/products/123?tab=inventory");
      expect(safeInternalPath("/")).toBe("/");
    });

    it("neutralizes protocol-relative and external open-redirect vectors", () => {
      expect(safeInternalPath("//evil.com")).toBe("/");
      expect(safeInternalPath("https://evil.com/phish")).toBe("/");
      expect(safeInternalPath("javascript:alert(1)")).toBe("/");
      expect(safeInternalPath(null)).toBe("/");
      expect(safeInternalPath(undefined)).toBe("/");
    });
  });

  describe("Validation Schemas (Zod)", () => {
    it("validates staff invitation payload", () => {
      const valid = inviteStaffSchema.safeParse({
        name: "Dr. Hamza",
        email: "hamza@scrubx.pk",
        role: "staff",
      });
      expect(valid.success).toBe(true);

      const invalidEmail = inviteStaffSchema.safeParse({
        name: "Dr. Hamza",
        email: "not-an-email",
        role: "staff",
      });
      expect(invalidEmail.success).toBe(false);

      const invalidRole = inviteStaffSchema.safeParse({
        name: "Dr. Hamza",
        email: "hamza@scrubx.pk",
        role: "super_hero",
      });
      expect(invalidRole.success).toBe(false);
    });

    it("validates customer note creation", () => {
      const valid = addCustomerNoteSchema.safeParse({
        customerId: "00000000-0000-0000-0000-000000000001",
        body: "Customer requested delivery after 3 PM.",
        isPinned: true,
      });
      expect(valid.success).toBe(true);

      const emptyNote = addCustomerNoteSchema.safeParse({
        customerId: "00000000-0000-0000-0000-000000000001",
        body: "",
      });
      expect(emptyNote.success).toBe(false);
    });
  });
});
