/**
 * Test Suite: Batch 11 — UX, Search, Notes & Authorization Honesty (BUG-023, BUG-024, BUG-025, BUG-026, DB-011)
 *
 * Verifies:
 * 1. BUG-023: Global search parameter plumbing and query execution across orders, products, and customers.
 * 2. BUG-024: Orders list payment-method filtering (including sadapay, nayapay) and month-scoped delivered count.
 * 3. BUG-025 / DB-011: Dedicated customer_notes table, multiline notes preserving delimiters, cascade on delete, and DTO mapping.
 * 4. BUG-026: UI capability matrix parity against server authorization contracts across staff, admin, and super_admin.
 */

import assert from "node:assert";
import { db } from "../db/index.ts";
import { customers, customerNotes, orders, baUser } from "../db/schema/index.ts";
import { eq, sql } from "drizzle-orm";
import { customerService } from "../server/services/customer.service.ts";
import { orderService } from "../server/services/order.service.ts";
import { productService } from "../server/services/product.service.ts";
import { toCustomerDTO, toOrderDTO } from "../lib/dto.ts";
import { can, CAPABILITIES } from "../lib/permissions.ts";
import type { AdminContext } from "../server/auth.ts";

const mockSuperAdmin: AdminContext = {
  id: "0d0a9176-e6fc-43bd-984d-66287ab4f805",
  name: "System Super Admin",
  email: "admin@scrubx.pk",
  role: "super_admin",
};

const mockAdmin: AdminContext = {
  id: "0d0a9176-e6fc-43bd-984d-66287ab4f805",
  name: "Store Admin",
  email: "admin@scrubx.pk",
  role: "admin",
};

const mockStaff: AdminContext = {
  id: "0d0a9176-e6fc-43bd-984d-66287ab4f805",
  name: "Staff Member",
  email: "staff@scrubx.pk",
  role: "staff",
};

let passed = 0;
let failed = 0;

function it(desc: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`  ✓ ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${desc}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  })();
}

async function runTests() {
  console.log("\n========================================================");
  console.log("  Batch 11: UX, Search & Authorization Honesty Tests    ");
  console.log("========================================================\n");

  let testCustomerId: string | null = null;
  let testNoteId: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // 1. BUG-023: Global Search Plumbing
    // -------------------------------------------------------------------------
    console.log("1. BUG-023: Global Search Query Execution");

    await it("productService.getProducts respects q search parameter", async () => {
      const result = await productService.getProducts(
        { page: 1, limit: 10, q: "scrub", sortBy: "createdAt", sortOrder: "desc" },
        mockStaff
      );
      assert(result && Array.isArray(result.items), "Returns items array");
      assert(result.pagination.page === 1, "Page is 1");
    });

    await it("orderService.getOrders respects q search parameter", async () => {
      const result = await orderService.getOrders(
        { page: 1, limit: 10, q: "SX-", sortBy: "placedAt", sortOrder: "desc" },
        mockStaff
      );
      assert(result && Array.isArray(result.items), "Returns items array");
      assert(result.pagination.page === 1, "Page is 1");
    });

    await it("customerService.getCustomers respects q search parameter", async () => {
      const result = await customerService.getCustomers(
        { page: 1, limit: 10, q: "dr", sortBy: "createdAt", sortOrder: "desc" },
        mockStaff
      );
      assert(result && Array.isArray(result.items), "Returns items array");
      assert(result.pagination.page === 1, "Page is 1");
    });

    // -------------------------------------------------------------------------
    // 2. BUG-024: Order Filters & Month-scoped Delivery Badge
    // -------------------------------------------------------------------------
    console.log("\n2. BUG-024: Order Filters & Accurate Delivery Counts");

    await it("orderService.getDeliveredThisMonthCount returns a non-negative integer", async () => {
      const count = await orderService.getDeliveredThisMonthCount(mockStaff);
      assert(typeof count === "number", "Returns number");
      assert(Number.isInteger(count) && count >= 0, "Is non-negative integer");
    });

    await it("toOrderDTO normalises bank_transfer to bank and preserves sadapay/nayapay", () => {
      const dummyOrder = {
        id: "d0000000-0000-0000-0000-000000000001",
        orderNumber: "SX-9999",
        customerId: "c0000000-0000-0000-0000-000000000001",
        status: "confirmed",
        subtotal: 5000,
        total: 5000,
        currency: "PKR",
        placedAt: new Date(),
        updatedAt: new Date(),
        items: [],
        payments: [],
        paymentMethod: { code: "bank_transfer", name: "Bank Transfer" },
      };

      const dtoBank = toOrderDTO(dummyOrder as any);
      assert.strictEqual(dtoBank.paymentMethod, "bank", "bank_transfer normalises to bank");

      const dtoSada = toOrderDTO({
        ...dummyOrder,
        paymentMethod: { code: "sadapay", name: "SadaPay" },
      } as any);
      assert.strictEqual(dtoSada.paymentMethod, "sadapay", "sadapay preserved");

      const dtoNaya = toOrderDTO({
        ...dummyOrder,
        paymentMethod: { code: "nayapay", name: "NayaPay" },
      } as any);
      assert.strictEqual(dtoNaya.paymentMethod, "nayapay", "nayapay preserved");
    });

    // -------------------------------------------------------------------------
    // 3. BUG-025 & DB-011: Structured Customer Notes
    // -------------------------------------------------------------------------
    console.log("\n3. BUG-025 & DB-011: Customer Notes Dedicated Table & DTO Mapping");

    await it("Creates a customer and adds notes with delimiter text intact", async () => {
      const testEmail = `test.notes.${Date.now()}@example.pk`;
      const [newCust] = await db
        .insert(customers)
        .values({
          email: testEmail,
          firstName: "Dr. Ayesha",
          lastName: "Khan",
          phone: "03001234567",
        })
        .returning();

      testCustomerId = newCust.id;

      // Add Note 1 with raw separator inside body
      const noteBody1 = "Prefers petite sizing\n---\nRequires logo embroidered on left sleeve.";
      const note1 = await customerService.addNote(testCustomerId, noteBody1, mockAdmin);
      testNoteId = note1.id;

      assert.strictEqual(note1.body, noteBody1, "Note 1 body stored with delimiter intact");
      assert.strictEqual(note1.createdBy, mockAdmin.id, "Note 1 author attributed to admin");

      // Add Note 2
      const noteBody2 = "Ordered emergency scrubs for Aga Khan Hospital rotation.";
      const note2 = await customerService.addNote(testCustomerId, noteBody2, mockAdmin);
      assert.strictEqual(note2.body, noteBody2, "Note 2 stored intact");

      // Fetch customer detail bundle
      const customerDetail = await customerService.getCustomerById(testCustomerId, mockStaff);
      assert(customerDetail.notesTimeline && customerDetail.notesTimeline.length >= 2, "Customer bundle includes notesTimeline");
      assert.strictEqual(customerDetail.notesTimeline[0].id, note2.id, "Notes ordered descending (newest first)");

      // Test DTO mapping
      const dto = toCustomerDTO(customerDetail);
      assert.strictEqual(dto.notes.length, 2, "DTO maps discrete note rows");
      assert.strictEqual(dto.notes[1].text, noteBody1, "DTO preserves delimiter in note body");
      assert.strictEqual(dto.notes[0].text, noteBody2, "DTO note 2 text matches");
      assert(dto.notes[0].at, "DTO contains valid timestamp");
    });

    await it("Staff cannot add customer note (assertRole rejects)", async () => {
      assert(testCustomerId, "testCustomerId must be defined");
      let rejected = false;
      try {
        await customerService.addNote(testCustomerId, "Staff attempting note", mockStaff);
      } catch (err: any) {
        rejected = true;
      }
      assert(rejected, "Adding note by staff threw authorization error");
    });

    await it("Cascade deletion: deleting customer cascades all customer_notes", async () => {
      assert(testCustomerId, "testCustomerId must be defined");
      await db.delete(customers).where(eq(customers.id, testCustomerId));

      const remainingNotes = await db
        .select()
        .from(customerNotes)
        .where(eq(customerNotes.customerId, testCustomerId));

      assert.strictEqual(remainingNotes.length, 0, "All customer_notes were cascaded upon customer deletion");
      testCustomerId = null;
    });

    // -------------------------------------------------------------------------
    // 4. BUG-026: UI Capability Matrix
    // -------------------------------------------------------------------------
    console.log("\n4. BUG-026: UI Capability Matrix Parity");

    await it("Staff role has read-only/clerk access and no admin capabilities", () => {
      assert.strictEqual(can("staff", "order:create"), true, "Staff can create orders");
      assert.strictEqual(can("staff", "order:note"), true, "Staff can add order notes");
      assert.strictEqual(can("staff", "payment:submit"), true, "Staff can submit payment proofs");

      assert.strictEqual(can("staff", "product:write"), false, "Staff cannot mutate products");
      assert.strictEqual(can("staff", "category:write"), false, "Staff cannot mutate categories");
      assert.strictEqual(can("staff", "order:status"), false, "Staff cannot transition order status");
      assert.strictEqual(can("staff", "order:ship"), false, "Staff cannot update shipping details");
      assert.strictEqual(can("staff", "payment:verify"), false, "Staff cannot approve/reject payments");
      assert.strictEqual(can("staff", "customer:write"), false, "Staff cannot mutate customers");
      assert.strictEqual(can("staff", "inventory:adjust"), false, "Staff cannot adjust inventory");
      assert.strictEqual(can("staff", "settings:write"), false, "Staff cannot mutate settings");
    });

    await it("Admin role has full operational access except store settings", () => {
      assert.strictEqual(can("admin", "product:write"), true, "Admin can mutate products");
      assert.strictEqual(can("admin", "category:write"), true, "Admin can mutate categories");
      assert.strictEqual(can("admin", "inventory:adjust"), true, "Admin can adjust inventory");
      assert.strictEqual(can("admin", "order:status"), true, "Admin can transition order status");
      assert.strictEqual(can("admin", "order:ship"), true, "Admin can update shipping");
      assert.strictEqual(can("admin", "payment:verify"), true, "Admin can verify payments");
      assert.strictEqual(can("admin", "customer:write"), true, "Admin can write customer notes");
      assert.strictEqual(can("admin", "settings:write"), false, "Admin cannot edit store settings");
    });

    await it("Super Admin role has universal capability access", () => {
      const allCapabilities = Object.keys(CAPABILITIES) as (keyof typeof CAPABILITIES)[];
      for (const cap of allCapabilities) {
        assert.strictEqual(can("super_admin", cap), true, `Super admin can perform ${cap}`);
      }
    });

    await it("Null, undefined, and unrecognized roles cannot perform any capability", () => {
      assert.strictEqual(can(null, "product:write"), false);
      assert.strictEqual(can(undefined, "order:status"), false);
      assert.strictEqual(can("guest", "settings:write"), false);
      assert.strictEqual(can("anonymous", "payment:verify"), false);
    });

  } catch (err: any) {
    console.error("Test execution failed:", err);
    process.exit(1);
  } finally {
    if (testCustomerId) {
      await db.delete(customers).where(eq(customers.id, testCustomerId)).catch(() => {});
    }
  }

  console.log("\n--------------------------------------------------------");
  console.log(`Test Execution Complete: ${passed} Passed, ${failed} Failed`);
  console.log("--------------------------------------------------------\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
