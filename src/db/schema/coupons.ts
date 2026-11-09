import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  integer,
  numeric,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { discountTypeEnum } from "./enums.ts";

/**
 * Marketing & Discount Coupons
 *
 * Security: RLS is enabled with zero direct public access.
 */

export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(), // Case-insensitive code
    description: text("description"),
    discountType: discountTypeEnum("discount_type").notNull(),
    discountValue: numeric("discount_value").notNull(),
    minimumOrderAmount: numeric("minimum_order_amount", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("0"),
    maximumDiscountAmount: numeric("maximum_discount_amount", {
      precision: 12,
      scale: 2,
    }),
    usageLimit: integer("usage_limit"),
    usageLimitPerCustomer: integer("usage_limit_per_customer"),
    usageCount: integer("usage_count").notNull().default(0),
    firstOrderOnly: boolean("first_order_only").notNull().default(false),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_coupons_code_upper").on(sql`upper(${table.code})`),
    check("chk_coupons_code_upper", sql`${table.code} = upper(${table.code})`),
    check("chk_coupons_discount_value", sql`${table.discountValue} > 0`),
    check(
      "chk_coupons_percentage_cap",
      sql`${table.discountType} != 'percentage' OR ${table.discountValue} <= 100`
    ),
    check("chk_coupons_min_amount", sql`${table.minimumOrderAmount} >= 0`),
    check(
      "chk_coupons_max_discount",
      sql`${table.maximumDiscountAmount} IS NULL OR ${table.maximumDiscountAmount} > 0`
    ),
    check(
      "chk_coupons_usage_limit",
      sql`${table.usageLimit} IS NULL OR ${table.usageLimit} > 0`
    ),
    check(
      "chk_coupons_cust_limit",
      sql`${table.usageLimitPerCustomer} IS NULL OR ${table.usageLimitPerCustomer} > 0`
    ),
    check("chk_coupons_usage_count", sql`${table.usageCount} >= 0`),
    check(
      "chk_coupons_expiry",
      sql`${table.expiresAt} IS NULL OR ${table.expiresAt} > ${table.startsAt}`
    ),
  ]
);
