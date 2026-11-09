import {
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  jsonb,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { paymentStatusEnum } from "./enums.ts";
import { baUser } from "./auth.ts";
import { orders } from "./orders.ts";
import { paymentMethods } from "./payment-methods.ts";
import type { PaymentMetadata } from "./json-types.ts";

/**
 * Payments & Financial Verification
 *
 * Designed for Pakistani payment collection: screenshot proof verification via WhatsApp / direct upload.
 * Triggers: trg_payments_updated_at maintains updated_at automatically.
 * Security: RLS is enabled with zero direct public access.
 */

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    paymentMethodId: uuid("payment_method_id")
      .notNull()
      .references(() => paymentMethods.id, { onDelete: "restrict" }),
    status: paymentStatusEnum("status").notNull().default("pending"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("PKR"),
    senderName: text("sender_name"),
    senderAccountLast4: text("sender_account_last4"),
    transactionReference: text("transaction_reference"), // TID from mobile wallet or 1Link transfer
    proofUrl: text("proof_url"), // ImageKit screenshot URL
    providerPaymentId: text("provider_payment_id"), // Reserved for automated payment gateways
    metadata: jsonb("metadata").$type<PaymentMetadata>().notNull().default({}),
    verifiedBy: text("verified_by").references(() => baUser.id, {
      onDelete: "set null",
    }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundAmount: numeric("refund_amount", { precision: 12, scale: 2 }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundedBy: text("refunded_by").references(() => baUser.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_payments_order_id").on(table.orderId),
    index("idx_payments_status").on(table.status),
    index("idx_payments_order_created").on(table.orderId, table.createdAt.desc()),
    index("idx_payments_status_created").on(table.status, table.createdAt.desc()),
    index("idx_payments_method_txn").on(table.paymentMethodId, table.transactionReference),
    check("chk_payments_amount", sql`${table.amount} >= 0`),
    check("chk_payments_currency", sql`length(${table.currency}) = 3`),
    check(
      "chk_payments_refund_amount",
      sql`${table.refundAmount} IS NULL OR (${table.refundAmount} > 0 AND ${table.refundAmount} <= ${table.amount})`
    ),
  ]
);
