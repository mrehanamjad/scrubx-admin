import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../src/db/index.ts";
import {
  productCategories,
  products,
  productVariants,
  inventory,
  orders,
  orderItems,
  orderStatusHistory,
  payments,
  coupons,
  customers,
  inventoryMovements,
  paymentMethods,
  baUser,
} from "../../src/db/schema/index.ts";
import { eq, inArray } from "drizzle-orm";
import { orderService } from "../../src/server/services/order.service.ts";
import { paymentService } from "../../src/server/services/payment.service.ts";
import { inventoryService } from "../../src/server/services/inventory.service.ts";
import { couponService } from "../../src/server/services/coupon.service.ts";
import type { AdminContext } from "../../src/server/auth.ts";

describe("TEST-004: Concurrency & Transaction Invariants Test Suite", () => {
  const timestamp = Date.now();
  let admin: AdminContext;
  let testCategoryId: string;
  let testProductId: string;
  let testVariantAId: string;
  let testVariantBId: string;
  let testCustomerId: string;
  let bankPaymentMethodId: string;

  const cleanupOrderIds: string[] = [];
  const cleanupCouponIds: string[] = [];

  beforeAll(async () => {
    // 1. Identify Seeded Admin
    let adminId = "00000000-0000-0000-0000-000000000001";
    try {
      const [user] = await db
        .select({ id: baUser.id })
        .from(baUser)
        .where(eq(baUser.email, "admin@scrubx.pk"))
        .limit(1);
      if (user) adminId = user.id;
    } catch {}

    admin = {
      id: adminId,
      email: "admin@scrubx.pk",
      name: "Concurrency Admin",
      role: "super_admin",
    };

    // 2. Provision Test Category & Product
    const [cat] = await db
      .insert(productCategories)
      .values({
        name: `Concurrency Category ${timestamp}`,
        slug: `concurrency-cat-${timestamp}`,
        isActive: true,
      })
      .returning();
    testCategoryId = cat.id;

    const [prod] = await db
      .insert(products)
      .values({
        name: `Concurrency Scrub ${timestamp}`,
        slug: `concurrency-scrub-${timestamp}`,
        categoryId: testCategoryId,
        status: "active",
      })
      .returning();
    testProductId = prod.id;

    // 3. Provision Test Variants
    const [varA] = await db
      .insert(productVariants)
      .values({
        productId: testProductId,
        name: "Teal - M",
        sku: `CC-VAR-A-${timestamp}`,
        size: "M",
        price: "4000.00",
        isActive: true,
      })
      .returning();
    testVariantAId = varA.id;

    const [varB] = await db
      .insert(productVariants)
      .values({
        productId: testProductId,
        name: "Navy - L",
        sku: `CC-VAR-B-${timestamp}`,
        size: "L",
        price: "4000.00",
        isActive: true,
      })
      .returning();
    testVariantBId = varB.id;

    // 4. Provision Customer
    const [cust] = await db
      .insert(customers)
      .values({
        email: `concurrency_${timestamp}@scrubx.pk`,
        firstName: "Concurrent",
        lastName: "Tester",
        phone: "+923001234567",
      })
      .returning();
    testCustomerId = cust.id;

    // 5. Query Bank Transfer Payment Method
    const [bankMethod] = await db
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(eq(paymentMethods.code, "bank_transfer"))
      .limit(1);
    bankPaymentMethodId = bankMethod?.id || "00000000-0000-0000-0000-000000000001";
  });

  afterAll(async () => {
    // 1. Clean up all orders belonging to test customer
    if (testCustomerId) {
      try {
        const custOrders = await db
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.customerId, testCustomerId));

        const allOrderIds = Array.from(new Set([...cleanupOrderIds, ...custOrders.map((o) => o.id)]));
        if (allOrderIds.length > 0) {
          await db.delete(orderStatusHistory).where(inArray(orderStatusHistory.orderId, allOrderIds));
          await db.delete(orderItems).where(inArray(orderItems.orderId, allOrderIds));
          await db.delete(payments).where(inArray(payments.orderId, allOrderIds));
          await db.delete(orders).where(inArray(orders.id, allOrderIds));
        }
      } catch (err) {
        console.warn("[Cleanup Warning]: Orders cleanup:", err);
      }
    }

    // 2. Clean up coupons
    if (cleanupCouponIds.length > 0) {
      await db.delete(coupons).where(inArray(coupons.id, cleanupCouponIds));
    }

    // 3. Clean up variants, product, category, customer
    if (testVariantAId || testVariantBId) {
      await db.delete(inventoryMovements).where(inArray(inventoryMovements.variantId, [testVariantAId, testVariantBId]));
      await db.delete(inventory).where(inArray(inventory.variantId, [testVariantAId, testVariantBId]));
      await db.delete(productVariants).where(inArray(productVariants.productId, [testProductId]));
    }
    if (testProductId) await db.delete(products).where(eq(products.id, testProductId));
    if (testCategoryId) await db.delete(productCategories).where(eq(productCategories.id, testCategoryId));
    if (testCustomerId) await db.delete(customers).where(eq(customers.id, testCustomerId));
  });

  it("Scenario 1: Concurrent orders for the last 1 remaining unit -> exactly 1 succeeds, remaining rejected", async () => {
    // Reset stock to exactly 1 on-hand, 0 reserved
    await db.delete(inventory).where(eq(inventory.variantId, testVariantAId));
    await db.insert(inventory).values({
      variantId: testVariantAId,
      quantityOnHand: 1,
      quantityReserved: 0,
      reorderLevel: 5,
    });

    // Fire 3 concurrent order placement requests for 1 unit each
    const orderPayload = {
      customerId: testCustomerId,
      paymentMethodId: bankPaymentMethodId,
      items: [
        {
          variantId: testVariantAId,
          quantity: 1,
        },
      ],
      shippingAddress: {
        fullName: "Dr. Concurrency",
        phone: "+923001234567",
        addressLine1: "123 Medical Way",
        city: "Karachi",
        province: "Sindh",
        country: "PK",
      },
    };

    const promises = [
      orderService.createOrder(orderPayload, admin),
      orderService.createOrder(orderPayload, admin),
      orderService.createOrder(orderPayload, admin),
    ];

    const results = await Promise.allSettled(promises);

    const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
    const rejected = results.filter((r) => r.status === "rejected");

    for (const f of fulfilled) {
      cleanupOrderIds.push(f.value.id);
    }

    // Exactly 1 succeeds, 2 are rejected with Conflict/OutOfStock
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(2);

    // Verify final inventory: reserved = 1, on-hand = 1, available = 0
    const inv = await inventoryService.getVariantInventory(testVariantAId, admin);
    expect(inv.quantityOnHand).toBe(1);
    expect(inv.quantityReserved).toBe(1);
    expect(inv.quantityOnHand - inv.quantityReserved).toBe(0);
  });

  it("Scenario 2: Deadlock-free multi-item reservation (BUG-004 sort order invariant)", async () => {
    // Ensure both variants have plenty of stock
    await db.delete(inventory).where(inArray(inventory.variantId, [testVariantAId, testVariantBId]));
    await db.insert(inventory).values([
      { variantId: testVariantAId, quantityOnHand: 50, quantityReserved: 0 },
      { variantId: testVariantBId, quantityOnHand: 50, quantityReserved: 0 },
    ]);

    // Order 1 purchases [A, B]
    const orderAB = {
      customerId: testCustomerId,
      paymentMethodId: bankPaymentMethodId,
      items: [
        { variantId: testVariantAId, quantity: 1 },
        { variantId: testVariantBId, quantity: 1 },
      ],
      shippingAddress: {
        fullName: "Dr. A-B",
        phone: "+923001234567",
        addressLine1: "Clinic A",
        city: "Lahore",
        province: "Punjab",
        country: "PK",
      },
    };

    // Order 2 purchases [B, A] in opposite order
    const orderBA = {
      customerId: testCustomerId,
      paymentMethodId: bankPaymentMethodId,
      items: [
        { variantId: testVariantBId, quantity: 1 },
        { variantId: testVariantAId, quantity: 1 },
      ],
      shippingAddress: {
        fullName: "Dr. B-A",
        phone: "+923001234567",
        addressLine1: "Clinic B",
        city: "Lahore",
        province: "Punjab",
        country: "PK",
      },
    };

    // Run 2 parallel orders with opposite item order concurrently
    const results = await Promise.allSettled([
      orderService.createOrder(orderAB, admin),
      orderService.createOrder(orderBA, admin),
    ]);

    for (const r of results) {
      if (r.status === "fulfilled") {
        cleanupOrderIds.push(r.value.id);
      }
    }

    // Zero deadlock errors (PostgreSQL 40P01)
    const deadlocks = results.filter(
      (r) => r.status === "rejected" && String((r as PromiseRejectedResult).reason).includes("40P01")
    );
    expect(deadlocks.length).toBe(0);
  });

  it("Scenario 3: Concurrent approvePayment requests -> idempotent commitment, exactly 1 sale movement", async () => {
    // 1. Create order
    const order = await orderService.createOrder(
      {
        customerId: testCustomerId,
        paymentMethodId: bankPaymentMethodId,
        items: [{ variantId: testVariantAId, quantity: 2 }],
        shippingAddress: {
          fullName: "Dr. Idempotency",
          phone: "+923001234567",
          addressLine1: "Room 10",
          city: "Islamabad",
          province: "Federal",
          country: "PK",
        },
      },
      admin
    );
    cleanupOrderIds.push(order.id);

    // 2. Submit payment proof
    const [payRecord] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .limit(1);

    await paymentService.submitPaymentProof({
      paymentId: payRecord.id,
      senderName: "Dr. Idempotency",
      transactionReference: `SCB-CC-${timestamp}`,
      proofUrl: "https://ik.imagekit.io/scrubx/receipt.jpg",
    });

    // 3. Fire 2 concurrent payment approval requests
    const results = await Promise.allSettled([
      paymentService.approvePayment({ paymentId: payRecord.id, action: "approve" }, admin),
      paymentService.approvePayment({ paymentId: payRecord.id, action: "approve" }, admin),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    // 4. Verify exactly one 'sale' movement was created for this order
    const movements = await db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.orderId, order.id));

    const saleMovements = movements.filter((m) => m.reason === "sale");
    expect(saleMovements.length).toBe(1);
    expect(saleMovements[0].change).toBe(-2);
  });

  it("Scenario 4: Concurrent orders applying single-use coupon -> exactly 1 succeeds", async () => {
    // 1. Create single-use coupon (discountType: fixed_amount)
    const [coupon] = await db
      .insert(coupons)
      .values({
        code: `CC-ONCE-${timestamp}`,
        discountType: "fixed_amount",
        discountValue: "500.00",
        minimumOrderAmount: "1000.00",
        usageLimit: 1,
        usageCount: 0,
        usageLimitPerCustomer: 1,
        startsAt: new Date(),
        isActive: true,
      })
      .returning();
    cleanupCouponIds.push(coupon.id);

    // 2. Fire 3 concurrent orders with this coupon
    const orderWithCoupon = {
      customerId: testCustomerId,
      paymentMethodId: bankPaymentMethodId,
      couponCode: coupon.code,
      items: [{ variantId: testVariantAId, quantity: 1 }],
      shippingAddress: {
        fullName: "Dr. Coupon",
        phone: "+923001234567",
        addressLine1: "Aga Khan Hospital",
        city: "Karachi",
        province: "Sindh",
        country: "PK",
      },
    };

    const results = await Promise.allSettled([
      orderService.createOrder(orderWithCoupon, admin),
      orderService.createOrder(orderWithCoupon, admin),
      orderService.createOrder(orderWithCoupon, admin),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
    for (const f of fulfilled) {
      cleanupOrderIds.push(f.value.id);
    }

    // Exactly 1 order successfully used the coupon
    expect(fulfilled.length).toBe(1);

    // In DB, coupon usageCount is strictly 1
    const [dbCoupon] = await db
      .select({ usageCount: coupons.usageCount })
      .from(coupons)
      .where(eq(coupons.id, coupon.id));
    expect(dbCoupon.usageCount).toBe(1);
  });
});
