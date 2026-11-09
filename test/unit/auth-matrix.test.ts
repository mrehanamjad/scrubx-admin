import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { assertRole, hasMinimumRole, type AdminRole, type AdminContext } from "../../src/server/auth.ts";
import { can, CAPABILITIES } from "../../src/lib/permissions.ts";

/**
 * Expected Master Authorization Matrix (TEST-002)
 *
 * Source of truth for minimum required role per Server Action.
 */
const EXPECTED_ACTION_ROLES: Record<string, AdminRole> = {
  // Staff management (strictly super_admin)
  getStaffListAction: "super_admin",
  inviteStaffAction: "super_admin",
  updateStaffRoleAction: "super_admin",
  banStaffAction: "super_admin",
  unbanStaffAction: "super_admin",

  // Settings & Health (super_admin for mutations, staff for health/reads)
  getStoreSettingsAction: "staff",
  getStoreSettingByKeyAction: "staff",
  updateStoreSettingAction: "super_admin",
  updateStoreSettingsBatchAction: "super_admin",
  getDatabaseHealthAction: "staff",
  markNotificationReadAction: "staff",

  // Payments (refund requires admin, verify requires admin, submit allows staff)
  submitPaymentProofAction: "staff",
  approvePaymentAction: "admin",
  rejectPaymentAction: "admin",
  refundPaymentAction: "admin",
  markOrderPaymentPaidAction: "admin",
  markOrderPaymentPendingAction: "admin",

  // Catalog Products & Categories (admin)
  getProductsAction: "staff",
  getProductByIdAction: "staff",
  createProductAction: "admin",
  updateProductAction: "admin",
  archiveProductAction: "admin",
  deleteProductAction: "admin",
  detachProductImageAction: "admin",
  getCategoriesAction: "staff",
  getCategoryByIdAction: "staff",
  createCategoryAction: "admin",
  updateCategoryAction: "admin",
  deleteCategoryAction: "admin",
  toggleCategoryStatusAction: "admin",

  // Inventory (admin for adjustments/restock, staff for view)
  getInventoryAction: "staff",
  getInventorySummaryAction: "staff",
  getVariantInventoryAction: "staff",
  getProductInventoryAction: "staff",
  adjustStockAction: "admin",
  restockAction: "admin",
  getInventoryMovementsAction: "staff",

  // Orders & Fulfillment
  createOrderAction: "staff",
  updateOrderStatusAction: "admin",
  bulkUpdateOrderStatusAction: "admin",
  updateOrderShippingAction: "admin",
  addOrderNoteAction: "staff",
  requestOrderReturnAction: "staff",
  approveOrderReturnAction: "admin",
  receiveOrderReturnAction: "admin",
  completeOrderReturnAction: "admin",
  createOrderExchangeAction: "admin",
  getOrderReturnsAction: "staff",

  // Coupons (admin)
  createCouponAction: "admin",
  updateCouponAction: "admin",
  toggleCouponStatusAction: "admin",
  deleteCouponAction: "admin",

  // Shipping Methods (admin)
  createShippingMethodAction: "admin",
  updateShippingMethodAction: "admin",
  toggleShippingMethodStatusAction: "admin",
  deleteShippingMethodAction: "admin",
  reorderShippingMethodsAction: "admin",

  // Payment Methods (admin)
  updatePaymentMethodAction: "admin",
  togglePaymentMethodStatusAction: "admin",
  reorderPaymentMethodsAction: "admin",

  // Engraving Options (admin)
  createEngravingOptionAction: "admin",
  updateEngravingOptionAction: "admin",
  toggleEngravingOptionStatusAction: "admin",
  deleteEngravingOptionAction: "admin",

  // Customers & Notes
  updateCustomerAction: "admin",
  saveCustomerAddressAction: "admin",
  deleteCustomerAddressAction: "admin",
  addCustomerNoteAction: "admin",
  deleteCustomerNoteAction: "super_admin",
  getCustomerActivityFeedAction: "staff",

  // Media
  recordMediaUploadAction: "staff",
  listOrphanMediaAction: "super_admin",
  cleanupOrphanMediaAction: "super_admin",
};

describe("TEST-002: Declarative Authorization Matrix Test Suite", () => {
  const actionsDir = path.resolve(import.meta.dirname, "../../src/actions");

  it("extracts all Server Actions and cross-checks with expected master matrix", () => {
    const files = fs.readdirSync(actionsDir).filter((f) => f.endsWith(".ts"));
    const extractedActions: Record<string, AdminRole> = {};

    for (const file of files) {
      const content = fs.readFileSync(path.join(actionsDir, file), "utf8");
      // Find export const <name> = createSafeAction({ ... requiredRole: "<role>"
      const regex = /export\s+const\s+([a-zA-Z0-9_]+)\s*=\s*createSafeAction\([\s\S]*?requiredRole:\s*["'](super_admin|admin|staff)["']/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        extractedActions[match[1]] = match[2] as AdminRole;
      }
    }

    // Verify all expected actions exist and match expected roles
    for (const [actionName, expectedRole] of Object.entries(EXPECTED_ACTION_ROLES)) {
      const extractedRole = extractedActions[actionName];
      expect(
        extractedRole,
        `Server Action '${actionName}' must have requiredRole: '${expectedRole}'`
      ).toBe(expectedRole);
    }
  });

  it("enforces strict hierarchy logic for each role level across all actions", () => {
    const superAdminCtx: AdminContext = { id: "sa-1", name: "Super", email: "sa@scrubx.pk", role: "super_admin" };
    const adminCtx: AdminContext = { id: "a-1", name: "Admin", email: "a@scrubx.pk", role: "admin" };
    const staffCtx: AdminContext = { id: "s-1", name: "Staff", email: "s@scrubx.pk", role: "staff" };

    for (const [actionName, requiredRole] of Object.entries(EXPECTED_ACTION_ROLES)) {
      if (requiredRole === "super_admin") {
        expect(() => assertRole(superAdminCtx, [requiredRole])).not.toThrow();
        expect(() => assertRole(adminCtx, [requiredRole])).toThrow();
        expect(() => assertRole(staffCtx, [requiredRole])).toThrow();
      } else if (requiredRole === "admin") {
        expect(() => assertRole(superAdminCtx, [requiredRole])).not.toThrow();
        expect(() => assertRole(adminCtx, [requiredRole])).not.toThrow();
        expect(() => assertRole(staffCtx, [requiredRole])).toThrow();
      } else if (requiredRole === "staff") {
        expect(() => assertRole(superAdminCtx, [requiredRole])).not.toThrow();
        expect(() => assertRole(adminCtx, [requiredRole])).not.toThrow();
        expect(() => assertRole(staffCtx, [requiredRole])).not.toThrow();
      }
    }
  });

  it("verifies that customer role is prohibited from all admin capabilities", () => {
    for (const cap of Object.keys(CAPABILITIES) as (keyof typeof CAPABILITIES)[]) {
      expect(can("customer", cap)).toBe(false);
      expect(can(null, cap)).toBe(false);
      expect(can(undefined, cap)).toBe(false);
    }
  });
});
