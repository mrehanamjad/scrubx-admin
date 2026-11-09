import { db } from "../db/index.ts";
import {
  productCategories,
  products,
  productColors,
  productVariants,
  productImages,
  inventory,
  inventoryMovements,
  customers,
  addresses,
  paymentMethods,
  shippingMethods,
  engravingOptions,
  coupons,
  orders,
  orderItems,
  orderItemEngraving,
  orderCoupons,
  payments,
  orderNotes,
  storeSettings,
} from "../db/schema/index.ts";
import { eq, sql } from "drizzle-orm";

async function seedDatabase() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(" 🌿 ScrubX Master Database Seeder (Safe & Idempotent)");
  console.log("═══════════════════════════════════════════════════════════");

  // 1. Production safety guard
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_PRODUCTION_SEED) {
    throw new Error("CRITICAL SAFETY GUARD: Database seeding is blocked in production environment.");
  }

  // 2. Default Store Settings
  console.log("Seeding Store Settings...");
  const settingsData = [
    { key: "store_name", value: "ScrubX Pakistan" },
    { key: "tagline", value: "Premium Medical & Clinical Scrubs" },
    { key: "support_email", value: "support@scrubx.pk" },
    { key: "support_phone", value: "+92 300 1234567" },
    { key: "whatsapp_number", value: "+92 300 1234567" },
    { key: "store_address", value: "Plaza 45, Commercial Zone, Phase 5, DHA" },
    { key: "city", value: "Lahore" },
    { key: "province", value: "Punjab" },
    { key: "postal_code", value: "54000" },
    { key: "currency", value: "PKR" },
    { key: "payment_deadline_hours", value: 48 },
    { key: "low_stock_threshold", value: 10 },
  ];

  for (const s of settingsData) {
    await db
      .insert(storeSettings)
      .values({ key: s.key, value: s.value })
      .onConflictDoNothing();
  }

  // 3. System Payment Methods
  console.log("Seeding Payment Methods...");
  const methodsData = [
    {
      code: "jazzcash",
      name: "JazzCash Mobile Account",
      type: "wallet" as const,
      accountTitle: "ScrubX Apparel",
      accountNumber: "03001234567",
      instructions: "Transfer to JazzCash account and upload screenshot proof with TID.",
      allowedWithEngraving: true,
      supportsProof: true,
      sortOrder: 1,
      isActive: true,
    },
    {
      code: "easypaisa",
      name: "Easypaisa Wallet",
      type: "wallet" as const,
      accountTitle: "ScrubX Apparel",
      accountNumber: "03451234567",
      instructions: "Transfer to Easypaisa account and upload payment receipt.",
      allowedWithEngraving: true,
      supportsProof: true,
      sortOrder: 2,
      isActive: true,
    },
    {
      code: "sadapay",
      name: "SadaPay",
      type: "wallet" as const,
      accountTitle: "Rehan Ahmed",
      iban: "PK00SADA0000001234567890",
      instructions: "Send via SadaPay IBAN or phone number.",
      allowedWithEngraving: true,
      supportsProof: true,
      sortOrder: 3,
      isActive: true,
    },
    {
      code: "bank_transfer",
      name: "Direct Bank Transfer (Meezan / HBL)",
      type: "bank_transfer" as const,
      accountTitle: "ScrubX Healthcare Uniforms Pvt Ltd",
      accountNumber: "01010102030405",
      bankName: "Meezan Bank Ltd",
      iban: "PK56MEZN0001010102030405",
      instructions: "Transfer via online IBFT and submit reference number and receipt.",
      allowedWithEngraving: true,
      supportsProof: true,
      sortOrder: 4,
      isActive: true,
    },
    {
      code: "cod",
      name: "Cash on Delivery (COD)",
      type: "cod" as const,
      instructions: "Pay in cash upon doorstep courier delivery. Not available for customized scrubs.",
      allowedWithEngraving: false,
      supportsProof: false,
      sortOrder: 5,
      isActive: true,
    },
  ];

  for (const m of methodsData) {
    await db.insert(paymentMethods).values(m).onConflictDoNothing();
  }

  // 4. Shipping Methods
  console.log("Seeding Shipping Methods...");
  const shippingData = [
    {
      id: "10000000-0000-0000-0000-000000000001",
      name: "TCS Express Delivery",
      description: "Fast nationwide courier delivery across all major cities.",
      price: "250.00",
      freeAbove: "5000.00",
      minDays: 2,
      maxDays: 4,
      sortOrder: 1,
      isActive: true,
    },
    {
      id: "10000000-0000-0000-0000-000000000002",
      name: "Leopards Overnight",
      description: "Priority overnight delivery for urgent clinic requirements.",
      price: "350.00",
      freeAbove: "7500.00",
      minDays: 1,
      maxDays: 2,
      sortOrder: 2,
      isActive: true,
    },
    {
      id: "10000000-0000-0000-0000-000000000003",
      name: "Standard Ground Courier",
      description: "Economical tracked shipping for rural and secondary regions.",
      price: "180.00",
      freeAbove: "4000.00",
      minDays: 3,
      maxDays: 6,
      sortOrder: 3,
      isActive: true,
    },
  ];

  for (const s of shippingData) {
    await db.insert(shippingMethods).values(s).onConflictDoNothing();
  }

  // 5. Engraving Options
  console.log("Seeding Engraving Options...");
  const engravingData = [
    {
      id: "20000000-0000-0000-0000-000000000001",
      name: "Clinician Name & Designation",
      type: "name" as const,
      description: "Embroidered chest text (e.g. Dr. Ayesha Khan, MBBS).",
      price: "350.00",
      maxCharacters: 28,
      isActive: true,
    },
    {
      id: "20000000-0000-0000-0000-000000000002",
      name: "Hospital / Clinic Logo Embroidery",
      type: "logo" as const,
      description: "Precision vectorized logo digitized and stitched on sleeve or chest pocket.",
      price: "600.00",
      maxCharacters: null,
      isActive: true,
    },
  ];

  for (const e of engravingData) {
    await db.insert(engravingOptions).values(e).onConflictDoNothing();
  }

  // 6. Marketing Coupons
  console.log("Seeding Marketing Coupons...");
  const now = new Date();
  const nextMonth = new Date(now.getTime() + 30 * 86400000);
  const couponsData = [
    {
      id: "30000000-0000-0000-0000-000000000001",
      code: "WELCOME10",
      description: "10% off for verified first-time medical staff orders.",
      discountType: "percentage" as const,
      discountValue: "10.00",
      minimumOrderAmount: "2500.00",
      maximumDiscountAmount: "800.00",
      firstOrderOnly: true,
      usageLimit: 500,
      usageLimitPerCustomer: 1,
      startsAt: now,
      expiresAt: nextMonth,
      isActive: true,
    },
    {
      id: "30000000-0000-0000-0000-000000000002",
      code: "DOCTOR500",
      description: "Flat PKR 500 discount on orders over PKR 6,000.",
      discountType: "fixed_amount" as const,
      discountValue: "500.00",
      minimumOrderAmount: "6000.00",
      firstOrderOnly: false,
      usageLimit: 200,
      usageLimitPerCustomer: 2,
      startsAt: now,
      expiresAt: nextMonth,
      isActive: true,
    },
  ];

  for (const c of couponsData) {
    await db.insert(coupons).values(c).onConflictDoNothing();
  }

  // 7. Product Categories (Hierarchy)
  console.log("Seeding Product Categories...");
  const rootCatId = "40000000-0000-0000-0000-000000000001";
  const wTopCatId = "40000000-0000-0000-0000-000000000002";
  const mTopCatId = "40000000-0000-0000-0000-000000000003";
  const coatsCatId = "40000000-0000-0000-0000-000000000004";

  await db
    .insert(productCategories)
    .values([
      {
        id: rootCatId,
        name: "Scrub Apparel",
        slug: "scrub-apparel",
        parentId: null,
        description: "Core medical scrubs, sets, and antimicrobial surgical wear.",
        imageUrl: "/products/scrubs-teal.jpg",
        sortOrder: 1,
        isActive: true,
      },
      {
        id: wTopCatId,
        name: "Women's Scrub Tops",
        slug: "womens-scrub-tops",
        parentId: rootCatId,
        description: "Contoured V-neck and mock-neck scrub tops tailored for women.",
        imageUrl: "/products/scrubs-teal.jpg",
        sortOrder: 1,
        isActive: true,
      },
      {
        id: mTopCatId,
        name: "Men's Scrub Tops",
        slug: "mens-scrub-tops",
        parentId: rootCatId,
        description: "Classic utility scrub tops with multi-pocket storage.",
        imageUrl: "/products/scrubs-navy.jpg",
        sortOrder: 2,
        isActive: true,
      },
      {
        id: coatsCatId,
        name: "Lab Coats & Consultation Jackets",
        slug: "lab-coats",
        parentId: null,
        description: "Tailored clinic coats made with stain-resistant fabric.",
        imageUrl: "/products/lab-coat.jpg",
        sortOrder: 2,
        isActive: true,
      },
    ])
    .onConflictDoNothing();

  // 8. Products & Color / Variant Matrix
  console.log("Seeding Products and Inventory Matrix...");
  const prod1Id = "50000000-0000-0000-0000-000000000001";
  const prod2Id = "50000000-0000-0000-0000-000000000002";

  await db
    .insert(products)
    .values([
      {
        id: prod1Id,
        name: "FlexiPro Four-Way Stretch Scrub Set",
        slug: "flexipro-stretch-scrub-set",
        categoryId: rootCatId,
        description: "Breathable four-way stretch fabric with moisture-wicking and antimicrobial coating.",
        brand: "ScrubX Pro",
        gender: "unisex",
        material: "72% Polyester, 21% Rayon, 7% Spandex",
        status: "active",
        isEngravable: true,
        isFeatured: true,
      },
      {
        id: prod2Id,
        name: "AeroLite Classic Consultation Coat",
        slug: "aerolite-classic-consultation-coat",
        categoryId: coatsCatId,
        description: "Lightweight, fluid-resistant physician consultation coat with iPad pocket.",
        brand: "ScrubX Signature",
        gender: "unisex",
        material: "65% Cotton, 35% Polyester",
        status: "active",
        isEngravable: true,
        isFeatured: true,
      },
    ])
    .onConflictDoNothing();

  // Product 1 Colors
  const colTealId = "60000000-0000-0000-0000-000000000001";
  const colNavyId = "60000000-0000-0000-0000-000000000002";
  await db
    .insert(productColors)
    .values([
      { id: colTealId, productId: prod1Id, name: "Peacock Teal", hexCode: "#0F766E", sortOrder: 1 },
      { id: colNavyId, productId: prod1Id, name: "Midnight Navy", hexCode: "#1E293B", sortOrder: 2 },
    ])
    .onConflictDoNothing();

  // Product 1 Variants & Inventory
  const var1Id = "70000000-0000-0000-0000-000000000001";
  const var2Id = "70000000-0000-0000-0000-000000000002";
  const var3Id = "70000000-0000-0000-0000-000000000003";

  await db
    .insert(productVariants)
    .values([
      {
        id: var1Id,
        productId: prod1Id,
        colorId: colTealId,
        name: "FlexiPro - Teal - S",
        sku: "SX-FP-TEA-S",
        size: "S",
        price: "4950.00",
        compareAtPrice: "5500.00",
        isActive: true,
      },
      {
        id: var2Id,
        productId: prod1Id,
        colorId: colTealId,
        name: "FlexiPro - Teal - M",
        sku: "SX-FP-TEA-M",
        size: "M",
        price: "4950.00",
        compareAtPrice: "5500.00",
        isActive: true,
      },
      {
        id: var3Id,
        productId: prod1Id,
        colorId: colNavyId,
        name: "FlexiPro - Navy - L",
        sku: "SX-FP-NAV-L",
        size: "L",
        price: "4950.00",
        compareAtPrice: "5500.00",
        isActive: true,
      },
    ])
    .onConflictDoNothing();

  // Inventory rows & initial movements
  for (const [vId, stock] of [[var1Id, 45], [var2Id, 8], [var3Id, 0]] as const) {
    const [invRow] = await db
      .insert(inventory)
      .values({
        variantId: vId,
        quantityOnHand: stock,
        quantityReserved: 0,
        reorderLevel: 10,
      })
      .onConflictDoNothing()
      .returning();

    if (invRow) {
      await db.insert(inventoryMovements).values({
        variantId: vId,
        change: stock,
        reason: "restock",
      });
    }
  }

  // Product 1 Images
  await db
    .insert(productImages)
    .values([
      {
        productId: prod1Id,
        colorId: colTealId,
        imagekitFileId: "seed_tea_1",
        url: "/products/scrubs-teal.jpg",
        altText: "FlexiPro Peacock Teal Front",
        sortOrder: 0,
      },
      {
        productId: prod1Id,
        colorId: colNavyId,
        imagekitFileId: "seed_nav_1",
        url: "/products/scrubs-navy.jpg",
        altText: "FlexiPro Midnight Navy Front",
        sortOrder: 1,
      },
    ])
    .onConflictDoNothing();

  // 9. Customers & Addresses
  console.log("Seeding Customers & Addresses...");
  const cust1Id = "80000000-0000-0000-0000-000000000001";
  const cust2Id = "80000000-0000-0000-0000-000000000002";

  await db
    .insert(customers)
    .values([
      {
        id: cust1Id,
        email: "dr.ayesha@example.com",
        firstName: "Dr. Ayesha",
        lastName: "Khan",
        phone: "+92 301 9876543",
        notes: "Prefers Navy Teal sets with Dr. prefix embroidery.",
      },
      {
        id: cust2Id,
        email: "dr.usman@example.com",
        firstName: "Dr. Usman",
        lastName: "Tariq",
        phone: "+92 322 4567890",
        notes: "Cardiologist at Shaukat Khanum. Fast courier required.",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(addresses)
    .values([
      {
        customerId: cust1Id,
        label: "Clinic / Office",
        fullName: "Dr. Ayesha Khan",
        phone: "+92 301 9876543",
        addressLine1: "Doctors Hospital, OPD Block 3",
        city: "Lahore",
        province: "Punjab",
        postalCode: "54000",
        country: "PK",
        isDefault: true,
      },
      {
        customerId: cust2Id,
        label: "Hospital",
        fullName: "Dr. Usman Tariq",
        phone: "+92 322 4567890",
        addressLine1: "Shaukat Khanum Memorial Hospital, Johar Town",
        city: "Lahore",
        province: "Punjab",
        postalCode: "54700",
        country: "PK",
        isDefault: true,
      },
    ])
    .onConflictDoNothing();

  // 10. Orders & Line Items & Payments
  console.log("Seeding Orders & Payments...");
  const [bankMethod] = await db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.code, "bank_transfer"))
    .limit(1);

  const order1Id = "90000000-0000-0000-0000-000000000001";
  const [insertedOrder] = await db
    .insert(orders)
    .values({
      id: order1Id,
      orderNumber: "SX-1001",
      customerId: cust1Id,
      paymentMethodId: bankMethod?.id || null,
      shippingMethodId: "10000000-0000-0000-0000-000000000001",
      status: "confirmed",
      subtotal: "4950.00",
      shippingTotal: "0.00",
      discountTotal: "0.00",
      engravingTotal: "350.00",
      total: "5300.00",
      hasEngraving: true,
      shippingAddress: {
        fullName: "Dr. Ayesha Khan",
        phone: "+92 301 9876543",
        addressLine1: "Doctors Hospital, OPD Block 3",
        city: "Lahore",
        province: "Punjab",
        postalCode: "54000",
        country: "PK",
      },
    })
    .onConflictDoNothing()
    .returning();

  if (insertedOrder) {
    const [lineItem] = await db
      .insert(orderItems)
      .values({
        orderId: order1Id,
        variantId: var1Id,
        productName: "FlexiPro Four-Way Stretch Scrub Set",
        variantName: "FlexiPro - Teal - S",
        sku: "SX-FP-TEA-S",
        unitPrice: "4950.00",
        quantity: 1,
      })
      .returning();

    if (lineItem) {
      await db.insert(orderItemEngraving).values({
        orderItemId: lineItem.id,
        engravingOptionId: "20000000-0000-0000-0000-000000000001",
        text: "Dr. Ayesha Khan",
        placement: "Left Chest",
        price: "350.00",
      });
    }

    await db.insert(payments).values({
      orderId: order1Id,
      paymentMethodId: bankMethod?.id || "default",
      amount: "5300.00",
      status: "paid",
      transactionReference: "TRX-MEZN-883921",
      proofUrl: null,
      paidAt: now,
    });

    await db.insert(orderNotes).values({
      orderId: order1Id,
      body: "Customer requested expedited stitching for Monday clinic duty.",
    });
  }

  // Seed pending payment order for verification queue
  const order2Id = "90000000-0000-0000-0000-000000000002";
  const [pendingOrder] = await db
    .insert(orders)
    .values({
      id: order2Id,
      orderNumber: "SX-1002",
      customerId: cust2Id,
      paymentMethodId: bankMethod?.id || null,
      shippingMethodId: "10000000-0000-0000-0000-000000000001",
      status: "payment_submitted",
      subtotal: "4950.00",
      shippingTotal: "250.00",
      discountTotal: "0.00",
      engravingTotal: "0.00",
      total: "5200.00",
      hasEngraving: false,
      shippingAddress: {
        fullName: "Dr. Usman Tariq",
        phone: "+92 322 4567890",
        addressLine1: "Shaukat Khanum Memorial Hospital",
        city: "Lahore",
        province: "Punjab",
        postalCode: "54700",
        country: "PK",
      },
    })
    .onConflictDoNothing()
    .returning();

  if (pendingOrder) {
    await db.insert(orderItems).values({
      orderId: order2Id,
      variantId: var2Id,
      productName: "FlexiPro Four-Way Stretch Scrub Set",
      variantName: "FlexiPro - Teal - M",
      sku: "SX-FP-TEA-M",
      unitPrice: "4950.00",
      quantity: 1,
    });

    await db.insert(payments).values({
      orderId: order2Id,
      paymentMethodId: bankMethod?.id || "default",
      amount: "5200.00",
      status: "awaiting_verification",
      transactionReference: "TRX-JAZZ-192837",
      proofUrl: null,
    });
  }

  console.log("═══════════════════════════════════════════════════════════");
  console.log(" ✅ Database Seeding Completed Successfully!");
  console.log("═══════════════════════════════════════════════════════════");
  process.exit(0);
}

seedDatabase().catch((err) => {
  console.error("❌ Database Seeding Failed:", err);
  process.exit(1);
});
