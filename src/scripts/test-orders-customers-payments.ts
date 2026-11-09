import fs from "node:fs";

// Load environment variables for local testing
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
} else if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

import { eq, inArray } from "drizzle-orm";
import { db } from "../db/index.ts";
import { baUser } from "../db/schema/auth.ts";
import {
  products,
  productCategories,
  productVariants,
  productColors,
} from "../db/schema/catalog.ts";
import { inventory, inventoryMovements } from "../db/schema/inventory.ts";
import { customers, addresses } from "../db/schema/customers.ts";
import { orders, orderItems, orderItemEngraving, orderNotes, orderStatusHistory } from "../db/schema/orders.ts";
import { payments } from "../db/schema/payments.ts";
import { paymentMethods } from "../db/schema/payment-methods.ts";
import { engravingOptions } from "../db/schema/engraving.ts";

import { customerService } from "../server/services/customer.service.ts";
import { orderService } from "../server/services/order.service.ts";
import { paymentService } from "../server/services/payment.service.ts";
import { inventoryService } from "../server/services/inventory.service.ts";

import {
  ValidationError,
  ConflictError,
  NotFoundError,
  AuthorizationError,
} from "../server/errors.ts";
import type { AdminContext } from "../server/auth.ts";

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

async function runOrdersCustomersPaymentsTests() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(" 🛒 ScrubX Orders, Customers & Payments Test Suite");
  console.log("═══════════════════════════════════════════════════════════\n");

  const timestamp = Date.now();

  // 1. Identify Seeded Admin
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
    id: realAdminId || "00000000-0000-0000-0000-000000000001",
    email: "admin@scrubx.pk",
    name: "Master Admin",
    role: "super_admin",
  };

  const staffAdmin: AdminContext = {
    id: realAdminId || "00000000-0000-0000-0000-000000000002",
    email: "staff@scrubx.pk",
    name: "Junior Staff",
    role: "staff",
  };

  let testCategoryId: string | null = null;
  let testProductId: string | null = null;
  let testVariantId: string | null = null;
  let bankPaymentMethodId: string | null = null;
  let codPaymentMethodId: string | null = null;
  let testEngravingOptionId: string | null = null;
  let createdCustomerId: string | null = null;
  const createdOrderIds: string[] = [];

  try {
    // =========================================================================
    // Setup: Provision Prerequisites (Category, Product, Variant, Payment Methods, Engraving)
    // =========================================================================
    console.log("Setup: Provisioning Isolated Test Data...");

    // 1. Category
    const [cat] = await db
      .insert(productCategories)
      .values({
        name: `Test Order Category ${timestamp}`,
        slug: `test-order-cat-${timestamp}`,
      })
      .returning();
    testCategoryId = cat.id;

    // 2. Product
    const [prod] = await db
      .insert(products)
      .values({
        name: `Test Scrub Uniform ${timestamp}`,
        slug: `test-scrub-uniform-${timestamp}`,
        status: "active",
        categoryId: testCategoryId,
      })
      .returning();
    testProductId = prod.id;

    // 3. Color
    const [col] = await db
      .insert(productColors)
      .values({
        productId: testProductId,
        name: "Ceil Blue",
        hexCode: "#92A1CF",
      })
      .returning();

    // 4. Variant
    const [varRow] = await db
      .insert(productVariants)
      .values({
        productId: testProductId,
        colorId: col.id,
        sku: `SX-${timestamp}-BL-M`,
        name: "Test Scrub - Ceil Blue - M",
        size: "M",
        price: "4500.00",
      })
      .returning();
    testVariantId = varRow.id;

    // 5. Initial Inventory: 50 on hand, 0 reserved
    await db.insert(inventory).values({
      variantId: testVariantId,
      quantityOnHand: 50,
      quantityReserved: 0,
      reorderLevel: 10,
    });

    // 6. Payment Methods (Bank Transfer & COD)
    const existingBank = await db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.type, "bank_transfer"))
      .limit(1);

    if (existingBank[0]) {
      bankPaymentMethodId = existingBank[0].id;
    } else {
      const [newBank] = await db
        .insert(paymentMethods)
        .values({
          code: `bank_${timestamp}`,
          name: "Standard Chartered Bank",
          type: "bank_transfer",
          allowedWithEngraving: true,
          supportsProof: true,
        })
        .returning();
      bankPaymentMethodId = newBank.id;
    }

    const existingCod = await db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.type, "cod"))
      .limit(1);

    if (existingCod[0]) {
      codPaymentMethodId = existingCod[0].id;
    } else {
      const [newCod] = await db
        .insert(paymentMethods)
        .values({
          code: `cod_${timestamp}`,
          name: "Cash on Delivery",
          type: "cod",
          allowedWithEngraving: false, // Strict Rule: Prohibited with engraving!
          supportsProof: false,
        })
        .returning();
      codPaymentMethodId = newCod.id;
    }

    // 7. Engraving Option
    const [engOpt] = await db
      .insert(engravingOptions)
      .values({
        name: `Doctor Name Embroidery ${timestamp}`,
        type: "name",
        price: "500.00",
        isActive: true,
      })
      .returning();
    testEngravingOptionId = engOpt.id;

    assert(Boolean(testVariantId), "Test catalog, variant, payment methods and engraving provisioned");

    // =========================================================================
    // Category 1: Customer Management & Atomic Email Deduplication
    // =========================================================================
    console.log("\nCategory 1: Customer Management & Atomic Deduplication");

    const customerEmail = `doctor_${timestamp}@hospital.pk`;

    // 1.1 Atomic Upsert Customer
    const customer1 = await customerService.findOrCreateCustomer({
      email: customerEmail,
      firstName: "Dr. Ayesha",
      lastName: "Khan",
      phone: "+923001234567",
    });
    createdCustomerId = customer1.id;
    assert(Boolean(customer1.id), "Customer created with normalized email");
    assert(customer1.email === customerEmail, "Customer email matches input");

    // 1.2 Concurrency / Re-Order Deduplication: same email reuses ID
    const customer2 = await customerService.findOrCreateCustomer({
      email: customerEmail.toUpperCase(), // Test case-insensitivity
      firstName: "Dr. Ayesha",
      lastName: "Khan (Updated)",
    });
    assert(customer2.id === customer1.id, "Second lookup with uppercase email deduplicates to same customer ID");

    // 1.3 Add Customer Address
    const address = await customerService.saveAddress(
      {
        customerId: customer1.id,
        fullName: "Dr. Ayesha Khan",
        phone: "+923001234567",
        addressLine1: "Aga Khan University Hospital, Stadium Road",
        city: "Karachi",
        province: "Sindh",
        postalCode: "74800",
        country: "PK",
        isDefault: true,
      },
      superAdmin
    );
    assert(Boolean(address.id), "Customer delivery address saved successfully");
    assert(address.isDefault === true, "Address marked as default");

    // 1.4 Update Customer Info & Notes
    const updatedCustomer = await customerService.updateCustomer(
      {
        id: customer1.id,
        notes: "Prefers Navy Blue scrubs, size M. VIP client.",
      },
      superAdmin
    );
    assert(updatedCustomer.notes?.includes("VIP client") === true, "Customer administrative notes updated");

    // 1.5 Fetch Customer Details
    const fetchedDetail = await customerService.getCustomerById(customer1.id, superAdmin);
    assert(fetchedDetail.addresses.length === 1, "getCustomerById includes addresses array");

    // =========================================================================
    // Category 2: Order Placement, Snapshots & Stock Reservation
    // =========================================================================
    console.log("\nCategory 2: Order Placement, Snapshots & Stock Reservation");

    // Initial stock check
    const preOrderInv = await inventoryService.getVariantInventory(testVariantId!, superAdmin);
    assert(preOrderInv.quantityOnHand === 50, "Initial on-hand stock is 50");
    assert(preOrderInv.quantityReserved === 0, "Initial reserved stock is 0");
    assert(preOrderInv.availableStock === 50, "Initial available stock is 50");

    // 2.1 Create Order with 2 units of variant + Custom Engraving
    const order1 = await orderService.createOrder(
      {
        customerId: customer1.id,
        shippingAddress: {
          fullName: address.fullName,
          phone: address.phone,
          addressLine1: address.addressLine1,
          city: address.city,
          province: address.province,
          country: address.country,
        },
        items: [
          {
            variantId: testVariantId!,
            quantity: 2,
            engraving: {
              engravingOptionId: testEngravingOptionId!,
              text: "Dr. Ayesha Khan, MD",
              placement: "Left Chest",
            },
          },
        ],
        paymentMethodId: bankPaymentMethodId!,
        notes: "Please deliver to Department of Surgery",
      },
      superAdmin
    );

    createdOrderIds.push(order1.id);
    assert(Boolean(order1.id), "Order created successfully");
    assert(order1.status === "awaiting_payment", "Initial order status for bank transfer is 'awaiting_payment'");
    assert(order1.hasEngraving === true, "Order hasEngraving flag is true");
    // Subtotal: 2 * 4500 = 9000. Engraving: 2 * 500 = 1000. Total = 10000.
    assert(Number(order1.subtotal) === 9000, "Subtotal calculated accurately (2 * 4500 = 9000)");
    assert(Number(order1.engravingTotal) === 1000, "Engraving total calculated accurately (2 * 500 = 1000)");
    assert(Number(order1.total) === 10000, "Order total matches subtotal + engraving (10,000 PKR)");

    // 2.2 Verify Dual-Counter Stock Reservation
    const postOrderInv = await inventoryService.getVariantInventory(testVariantId!, superAdmin);
    assert(postOrderInv.quantityOnHand === 50, "Stock on-hand remains untouched (50) during reservation");
    assert(postOrderInv.quantityReserved === 2, "Stock reserved incremented to 2");
    assert(postOrderInv.availableStock === 48, "Available stock dynamically decremented to 48 (50 - 2)");

    // 2.3 Verify Order Item Snapshots Immutability
    // Mutate the product variant price in catalog to 5500 PKR
    await db
      .update(productVariants)
      .set({ price: "5500.00" })
      .where(eq(productVariants.id, testVariantId!));

    const reloadedOrder = await orderService.getOrderById(order1.id, superAdmin);
    assert(
      Number(reloadedOrder.items[0].unitPrice) === 4500,
      "Order item unitPrice snapshot remains 4500 despite catalog price update to 5500"
    );

    // =========================================================================
    // Category 3: Engraving & Cash on Delivery (COD) Rule Enforcement
    // =========================================================================
    console.log("\nCategory 3: Engraving & COD Business Rule Enforcement");

    let codWithEngravingBlocked = false;
    try {
      await orderService.createOrder(
        {
          customerId: customer1.id,
          shippingAddress: {
            fullName: address.fullName,
            phone: address.phone,
            addressLine1: address.addressLine1,
            city: address.city,
            country: address.country,
          },
          items: [
            {
              variantId: testVariantId!,
              quantity: 1,
              engraving: {
                engravingOptionId: testEngravingOptionId!,
                text: "Dr. Blocked COD",
              },
            },
          ],
          paymentMethodId: codPaymentMethodId!, // Prohibited!
        },
        superAdmin
      );
    } catch (err) {
      if (err instanceof ValidationError) codWithEngravingBlocked = true;
    }
    assert(codWithEngravingBlocked, "Placing order with custom engraving and Cash on Delivery is strictly rejected");

    // =========================================================================
    // Category 4: Payment Proof Submission & Rejection Workflow
    // =========================================================================
    console.log("\nCategory 4: Payment Proof Submission & Rejection Workflow");

    const order1Payment = order1.payments[0];
    assert(Boolean(order1Payment?.id), "Initial pending payment record generated");
    assert(order1Payment.status === "pending", "Payment initial status is 'pending'");

    const txRef1 = `SCB-TX-998877-${timestamp}`;
    const txRef2 = `SCB-TX-VERIFIED-${timestamp}`;

    // 4.1 Customer submits screenshot proof & TID
    const submittedPayment = await paymentService.submitPaymentProof({
      paymentId: order1Payment.id,
      senderName: "Dr. Ayesha Khan",
      senderAccountLast4: "9876",
      transactionReference: txRef1,
      proofUrl: "https://ik.imagekit.io/scrubx/payment-proofs/receipt-01.jpg",
      imagekitFileId: "ik_file_proof_01",
    });
    assert(submittedPayment.status === "awaiting_verification", "Payment status updated to 'awaiting_verification'");
    assert(submittedPayment.transactionReference === txRef1, "Transaction reference recorded");

    const orderAfterSubmit = await orderService.getOrderById(order1.id, superAdmin);
    assert(orderAfterSubmit.status === "payment_submitted", "Order status advanced to 'payment_submitted'");

    // 4.2 Admin rejects payment proof with reason
    const rejectedPayment = await paymentService.rejectPayment(
      {
        paymentId: order1Payment.id,
        action: "reject",
        rejectionReason: "Screenshot unreadable. Transaction ID not found on 1Link portal.",
      },
      superAdmin
    );
    assert(rejectedPayment.status === "rejected", "Payment status updated to 'rejected'");
    assert(rejectedPayment.rejectionReason?.includes("1Link") === true, "Rejection reason recorded");
    assert(
      (rejectedPayment.metadata as any).rejectionHistory?.length === 1,
      "Payment rejection history recorded in metadata"
    );

    const orderAfterReject = await orderService.getOrderById(order1.id, superAdmin);
    assert(
      orderAfterReject.status === "awaiting_payment",
      "Order status safely reverted to 'awaiting_payment' for customer retry"
    );

    // =========================================================================
    // Category 5: Payment Approval & Idempotent Stock Commitment
    // =========================================================================
    console.log("\nCategory 5: Payment Approval & Idempotent Stock Commitment");

    // 5.1 Re-submit valid proof
    await paymentService.submitPaymentProof({
      paymentId: order1Payment.id,
      senderName: "Dr. Ayesha Khan",
      transactionReference: txRef2,
      proofUrl: "https://ik.imagekit.io/scrubx/payment-proofs/receipt-clear.jpg",
      imagekitFileId: "ik_file_proof_clear",
    });

    // 5.2 Admin approves payment
    const approvedPayment = await paymentService.approvePayment(
      {
        paymentId: order1Payment.id,
        action: "approve",
      },
      superAdmin
    );
    assert(approvedPayment.status === "paid", "Payment status updated to 'paid'");
    assert(approvedPayment.verifiedBy === superAdmin.id, "VerifiedBy tracks admin user ID");

    const orderAfterApprove = await orderService.getOrderById(order1.id, superAdmin);
    assert(orderAfterApprove.status === "confirmed", "Order status transitioned to 'confirmed'");

    // 5.3 Verify Inventory Commitment: On-hand permanently decremented, reservation cleared
    const postApproveInv = await inventoryService.getVariantInventory(testVariantId!, superAdmin);
    assert(postApproveInv.quantityOnHand === 48, "Quantity on-hand permanently committed from 50 to 48");
    assert(postApproveInv.quantityReserved === 0, "Quantity reserved cleared to 0");
    assert(postApproveInv.availableStock === 48, "Available stock is 48");

    // 5.4 Verify Inventory Movement 'sale' log
    const movements = await inventoryService.getMovements({ variantId: testVariantId! }, superAdmin);
    const saleMovement = movements.items.find((m) => m.reason === "sale");
    assert(Boolean(saleMovement), "Inventory movement 'sale' entry logged");
    assert(saleMovement?.change === -2, "Sale movement change is -2");

    // 5.5 Idempotency Test: approving payment second time does NOT double-deduct stock
    await paymentService.approvePayment(
      {
        paymentId: order1Payment.id,
        action: "approve",
      },
      superAdmin
    );
    const postIdempotentInv = await inventoryService.getVariantInventory(testVariantId!, superAdmin);
    assert(postIdempotentInv.quantityOnHand === 48, "Idempotent payment approval did NOT double-deduct stock (remains 48)");

    // =========================================================================
    // Category 6: Order Fulfillment Flow & Transition Matrix
    // =========================================================================
    console.log("\nCategory 6: Order Fulfillment Flow & State Transition Matrix");

    // 6.1 Transition confirmed -> processing
    const processingOrder = await orderService.updateOrderStatus(
      {
        orderId: order1.id,
        status: "processing",
        note: "Sent to embroidery department.",
      },
      superAdmin
    );
    assert(processingOrder.status === "processing", "Order status transitioned to 'processing'");

    // 6.2 Shipping: update order status to shipped + update courier details (BUG-006)
    const shippedOrder = await orderService.updateOrderStatus(
      {
        orderId: order1.id,
        status: "shipped",
        note: "Dispatched via TCS Express",
      },
      superAdmin
    );
    assert(shippedOrder.status === "shipped", "Order status updated to 'shipped'");

    const shippingInfo = await orderService.updateOrderShipping(
      {
        orderId: order1.id,
        courier: "TCS Express",
        trackingNumber: "TCS-9911223344",
      },
      superAdmin
    );
    assert(shippingInfo.courier === "TCS Express", "Courier recorded as TCS Express");
    assert(shippingInfo.trackingNumber === "TCS-9911223344", "Tracking number recorded");

    // 6.3 Delivery: update order status to delivered (BUG-006)
    const deliveredOrder = await orderService.updateOrderStatus(
      {
        orderId: order1.id,
        status: "delivered",
        note: "Customer confirmed delivery",
      },
      superAdmin
    );
    assert(deliveredOrder.status === "delivered", "Order status updated to 'delivered'");

    // 6.4 Illegal status transition rejection (delivered -> pending)
    let illegalTransitionBlocked = false;
    try {
      await orderService.updateOrderStatus(
        {
          orderId: order1.id,
          status: "pending",
        },
        superAdmin
      );
    } catch (err) {
      if (err instanceof ValidationError) illegalTransitionBlocked = true;
    }
    assert(illegalTransitionBlocked, "Illegal transition from 'delivered' to 'pending' rejected with ValidationError");

    // =========================================================================
    // Category 7: Cancellation Scenarios & Refund Processing
    // =========================================================================
    console.log("\nCategory 7: Explicit Cancellation Scenarios & Refund Processing");

    // 7.1 Scenario A: Cancelling an Unpaid Order (releases reserved stock)
    const orderA = await orderService.createOrder(
      {
        customerId: customer1.id,
        shippingAddress: {
          fullName: address.fullName,
          phone: address.phone,
          addressLine1: address.addressLine1,
          city: address.city,
          country: address.country,
        },
        items: [{ variantId: testVariantId!, quantity: 3 }],
        paymentMethodId: bankPaymentMethodId!,
      },
      superAdmin
    );
    createdOrderIds.push(orderA.id);

    const invAfterA = await inventoryService.getVariantInventory(testVariantId!, superAdmin);
    assert(invAfterA.quantityReserved === 3, "Scenario A: 3 units reserved on order creation");

    await orderService.updateOrderStatus(
      {
        orderId: orderA.id,
        status: "cancelled",
        note: "Customer cancelled before payment.",
      },
      superAdmin
    );

    const invAfterACancel = await inventoryService.getVariantInventory(testVariantId!, superAdmin);
    assert(invAfterACancel.quantityReserved === 0, "Scenario A: Cancelling unpaid order releases reservation back to 0");
    assert(invAfterACancel.quantityOnHand === 48, "Scenario A: On-hand quantity remains 48");

    // 7.2 Scenario B: Cancelling a Paid but Unshipped Order (restores warehouse stock)
    const orderB = await orderService.createOrder(
      {
        customerId: customer1.id,
        shippingAddress: {
          fullName: address.fullName,
          phone: address.phone,
          addressLine1: address.addressLine1,
          city: address.city,
          country: address.country,
        },
        items: [{ variantId: testVariantId!, quantity: 1 }],
        paymentMethodId: bankPaymentMethodId!,
      },
      superAdmin
    );
    createdOrderIds.push(orderB.id);

    // Approve payment -> stock on hand decrements from 48 to 47
    await paymentService.approvePayment(
      { paymentId: orderB.payments[0].id, action: "approve" },
      superAdmin
    );
    const invAfterBPaid = await inventoryService.getVariantInventory(testVariantId!, superAdmin);
    assert(invAfterBPaid.quantityOnHand === 47, "Scenario B: Paid order decrements on-hand stock to 47");

    // Cancel while in confirmed
    await orderService.updateOrderStatus(
      {
        orderId: orderB.id,
        status: "cancelled",
        note: "Order cancelled before dispatch. Restocking warehouse units.",
      },
      superAdmin
    );
    const invAfterBCancel = await inventoryService.getVariantInventory(testVariantId!, superAdmin);
    assert(invAfterBCancel.quantityOnHand === 48, "Scenario B: Cancelling paid unshipped order restores warehouse on-hand stock to 48");

    const orderBReloaded = await orderService.getOrderById(orderB.id, superAdmin);
    assert(orderBReloaded.payments[0].status === "paid", "Scenario B: Payment remains 'paid' (NOT automatically refunded)");

    // 7.3 Scenario C: Shipped / Delivered Order Cancellation Guard
    // order1 is currently 'delivered'. Attempting to cancel/refund order1 must NOT increment warehouse stock!
    const invBeforeDeliveredRefund = (await inventoryService.getVariantInventory(testVariantId!, superAdmin)).quantityOnHand;
    // Process payment refund for order1
    const refundedPayment = await paymentService.refundPayment(
      {
        paymentId: order1Payment.id,
        refundAmount: Number(order1Payment.amount),
        reason: "Customer size exchange refund processed via bank transfer.",
        restock: false,
      },
      superAdmin
    );
    assert(refundedPayment.status === "refunded", "Payment status updated to 'refunded'");

    const order1AfterRefund = await orderService.getOrderById(order1.id, superAdmin);
    assert(order1AfterRefund.status === "refunded", "Order status transitioned to 'refunded'");

    const invAfterDeliveredRefund = (await inventoryService.getVariantInventory(testVariantId!, superAdmin)).quantityOnHand;
    assert(
      invAfterDeliveredRefund === invBeforeDeliveredRefund,
      "Scenario C & D: Refunding delivered order does NOT alter warehouse physical inventory (remains 48)"
    );

    // =========================================================================
    // Category 8: Role Authorization Enforcement
    // =========================================================================
    console.log("\nCategory 8: Role Authorization Enforcement");

    let staffApproveBlocked = false;
    try {
      await paymentService.approvePayment(
        { paymentId: orderB.payments[0].id, action: "approve" },
        staffAdmin
      );
    } catch (err) {
      if (err instanceof AuthorizationError) staffApproveBlocked = true;
    }
    assert(staffApproveBlocked, "Staff role prohibited from approving payments");

    let staffRefundBlocked = false;
    try {
      await paymentService.refundPayment(
        {
          paymentId: orderB.payments[0].id,
          refundAmount: 100,
          reason: "Unauthorized",
          restock: false,
        },
        staffAdmin
      );
    } catch (err) {
      if (err instanceof AuthorizationError) staffRefundBlocked = true;
    }
    assert(staffRefundBlocked, "Staff role prohibited from refunding payments");

    let staffStatusBlocked = false;
    try {
      await orderService.updateOrderStatus(
        { orderId: order1.id, status: "confirmed" },
        staffAdmin
      );
    } catch (err) {
      if (err instanceof AuthorizationError) staffStatusBlocked = true;
    }
    assert(staffStatusBlocked, "Staff role prohibited from changing order status to 'confirmed'");

    // Add note allowed for staff
    const staffNote = await orderService.addOrderNote(
      {
        orderId: order1.id,
        body: "Staff checked tracking status with TCS. Confirmed delivered.",
      },
      staffAdmin
    );
    assert(Boolean(staffNote.id), "Staff role authorized to add order notes");
  } catch (err) {
    console.error("❌ Critical test execution error:", err);
    failed++;
  } finally {
    // Cleanup isolated test data
    console.log("\nPerforming test data cleanup...");
    try {
      if (createdOrderIds.length > 0) {
        await db.delete(payments).where(inArray(payments.orderId, createdOrderIds));
        await db.delete(orders).where(inArray(orders.id, createdOrderIds));
        console.log(`  Cleaned up ${createdOrderIds.length} test order(s) and associated payments.`);
      }
      if (createdCustomerId) {
        await db.delete(customers).where(eq(customers.id, createdCustomerId));
        console.log(`  Cleaned up test customer '${createdCustomerId}'.`);
      }
      if (testProductId) {
        await db.delete(products).where(eq(products.id, testProductId));
        console.log(`  Cleaned up test product '${testProductId}'.`);
      }
      if (testCategoryId) {
        await db.delete(productCategories).where(eq(productCategories.id, testCategoryId));
        console.log(`  Cleaned up test category '${testCategoryId}'.`);
      }
      if (testEngravingOptionId) {
        await db.delete(engravingOptions).where(eq(engravingOptions.id, testEngravingOptionId));
        console.log(`  Cleaned up test engraving option '${testEngravingOptionId}'.`);
      }
    } catch (cleanupErr) {
      console.warn("  Warning during cleanup:", cleanupErr);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(` Summary: ${passed} Passed, ${failed} Failed`);
  console.log("═══════════════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runOrdersCustomersPaymentsTests();
