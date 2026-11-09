import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  integer,
  numeric,
  jsonb,
  unique,
  uniqueIndex,
  index,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { orderStatusEnum } from "./enums.ts";
import { baUser } from "./auth.ts";
import { customers } from "./customers.ts";
import { productVariants } from "./catalog.ts";
import { engravingOptions } from "./engraving.ts";
import { paymentMethods } from "./payment-methods.ts";
import { shippingMethods } from "./shipping.ts";
import { coupons } from "./coupons.ts";
import type { ShippingAddressSnapshot } from "./json-types.ts";

/**
 * Orders Domain: Orders, Line Items, Personalization, Coupons, Notes & History.
 *
 * Migration Triggers:
 *  - trg_orders_number: Automatically generates order_number (e.g. SX-1001) via order_number_seq.
 *  - trg_orders_updated_at: Maintains updated_at timestamp.
 *  - trg_check_engraving_cod: Prohibits Cash on Delivery on orders with custom engraving (has_engraving = true).
 * Security: Row Level Security (RLS) is enabled across all tables (see migration).
 */

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Quoted by customers on WhatsApp (e.g. SX-1001). Generated automatically via trigger if not supplied */
    orderNumber: text("order_number").notNull().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    status: orderStatusEnum("status").notNull().default("awaiting_payment"),
    currency: text("currency").notNull().default("PKR"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    engravingTotal: numeric("engraving_total", { precision: 12, scale: 2 }).notNull().default("0"),
    discountTotal: numeric("discount_total", { precision: 12, scale: 2 }).notNull().default("0"),
    shippingTotal: numeric("shipping_total", { precision: 12, scale: 2 }).notNull().default("0"),
    taxTotal: numeric("tax_total", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    hasEngraving: boolean("has_engraving").notNull().default(false),
    paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id, {
      onDelete: "set null",
    }),
    shippingMethodId: uuid("shipping_method_id").references(() => shippingMethods.id, {
      onDelete: "set null",
    }),
    shippingMethodName: text("shipping_method_name"),
    contactPhone: text("contact_phone"),
    shippingAddress: jsonb("shipping_address").$type<ShippingAddressSnapshot>().notNull(),
    notes: text("notes"), // Customer-provided order note
    courier: text("courier"),
    trackingNumber: text("tracking_number"),
    paymentDueAt: timestamp("payment_due_at", { withTimezone: true }),
    placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_orders_customer_id").on(table.customerId),
    index("idx_orders_status_placed_at").on(table.status, table.placedAt.desc()),
    uniqueIndex("orders_idempotency_key_key").on(table.idempotencyKey),
    check("chk_orders_currency", sql`length(${table.currency}) = 3`),
    check("chk_orders_subtotal", sql`${table.subtotal} >= 0`),
    check("chk_orders_engraving_total", sql`${table.engravingTotal} >= 0`),
    check("chk_orders_discount_total", sql`${table.discountTotal} >= 0`),
    check("chk_orders_shipping_total", sql`${table.shippingTotal} >= 0`),
    check("chk_orders_tax_total", sql`${table.taxTotal} >= 0`),
    check("chk_orders_total_non_negative", sql`${table.total} >= 0`),
    check(
      "chk_order_total",
      sql`${table.total} = ${table.subtotal} + ${table.engravingTotal} - ${table.discountTotal} + ${table.shippingTotal} + ${table.taxTotal}`
    ),
  ]
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "restrict",
    }),
    sku: text("sku").notNull(), // Snapshot
    productName: text("product_name").notNull(), // Snapshot
    variantName: text("variant_name").notNull(), // Snapshot
    imageUrl: text("image_url"), // Snapshot
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(), // Snapshot
    quantity: integer("quantity").notNull(),
    /** Stored generated column in PostgreSQL: (unit_price * quantity) */
    lineTotal: numeric("line_total", { precision: 12, scale: 2 }).generatedAlwaysAs(
      sql`("unit_price" * "quantity")`
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_order_items_order_id").on(table.orderId),
    check("chk_order_items_unit_price", sql`${table.unitPrice} >= 0`),
    check("chk_order_items_quantity", sql`${table.quantity} > 0`),
  ]
);

export const orderItemEngraving = pgTable(
  "order_item_engraving",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    engravingOptionId: uuid("engraving_option_id").references(
      () => engravingOptions.id,
      { onDelete: "restrict" }
    ),
    text: text("text"), // Name to engrave
    logoUrl: text("logo_url"), // Uploaded vector logo from private ImageKit folder
    logoImagekitFileId: text("logo_imagekit_file_id"),
    placement: text("placement"), // e.g. "Left Chest", "Right Pocket"
    price: numeric("price", { precision: 12, scale: 2 }).notNull(), // Snapshot price per unit
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_order_item_engraving").on(table.orderItemId, table.engravingOptionId),
    index("idx_order_item_engraving_item").on(table.orderItemId),
    check("chk_order_item_engraving_price", sql`${table.price} >= 0`),
    check(
      "chk_engraving_content",
      sql`(${table.text} IS NOT NULL AND trim(${table.text}) <> '') OR (${table.logoUrl} IS NOT NULL AND trim(${table.logoUrl}) <> '')`
    ),
  ]
);

export const orderCoupons = pgTable(
  "order_coupons",
  {
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "restrict" }),
    discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releaseReason: text("release_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.orderId, table.couponId] }),
    check("chk_order_coupons_discount", sql`${table.discountAmount} >= 0`),
    check(
      "chk_order_coupons_release_reason",
      sql`${table.releaseReason} IS NULL OR ${table.releaseReason} IN ('order_cancelled', 'order_refunded', 'admin_correction')`
    ),
    index("idx_order_coupons_coupon_released").on(table.couponId, table.releasedAt),
  ]
);

/**
 * Internal order notes & team communications.
 */
export const orderNotes = pgTable(
  "order_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdBy: text("created_by").references(() => baUser.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_order_notes_order_id").on(table.orderId),
    check("chk_order_notes_body", sql`trim(${table.body}) <> ''`),
  ]
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status").notNull(),
    note: text("note"),
    changedBy: text("changed_by"), // ba_user.id or 'system'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_order_status_history_order").on(table.orderId)]
);

/**
 * Order Returns & RMAs (ECOM-002, ECOM-003)
 */
export const orderReturns = pgTable(
  "order_returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    replacementOrderId: uuid("replacement_order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("requested"),
    reason: text("reason").notNull(),
    requestedBy: text("requested_by").references(() => baUser.id, {
      onDelete: "set null",
    }),
    approvedBy: text("approved_by").references(() => baUser.id, {
      onDelete: "set null",
    }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    refundAmount: numeric("refund_amount", { precision: 12, scale: 2 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_order_returns_order_id").on(table.orderId),
    index("idx_order_returns_status").on(table.status),
    check(
      "chk_order_returns_status",
      sql`${table.status} IN ('requested', 'approved', 'received', 'restocked', 'rejected', 'completed')`
    ),
    check(
      "chk_order_returns_refund_amount",
      sql`${table.refundAmount} IS NULL OR ${table.refundAmount} > 0`
    ),
  ]
);

export const orderReturnItems = pgTable(
  "order_return_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    returnId: uuid("return_id")
      .notNull()
      .references(() => orderReturns.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    restock: boolean("restock").notNull().default(true),
  },
  (table) => [
    index("idx_order_return_items_return_id").on(table.returnId),
    check("chk_order_return_items_quantity", sql`${table.quantity} > 0`),
    unique("uq_order_return_item").on(table.returnId, table.orderItemId),
  ]
);
