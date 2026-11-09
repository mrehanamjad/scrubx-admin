import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  integer,
  numeric,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Shipping Methods & Delivery Thresholds
 *
 * Configurable delivery couriers (TCS, Leopard, Trax, Rider, etc.)
 * Triggers: updated_at maintained automatically.
 * Security: RLS is enabled with zero direct public access.
 */

export const shippingMethods = pgTable(
  "shipping_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    /** Standard delivery cost in PKR */
    price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
    /** Order subtotal qualifying for free delivery */
    freeAbove: numeric("free_above", { precision: 12, scale: 2 }),
    estimatedDays: integer("estimated_days"),
    minDays: integer("min_days"), // Configured in admin Shipping UI
    maxDays: integer("max_days"), // Configured in admin Shipping UI
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("chk_shipping_methods_price", sql`${table.price} >= 0`),
    check(
      "chk_shipping_methods_free_above",
      sql`${table.freeAbove} IS NULL OR ${table.freeAbove} >= 0`
    ),
    check(
      "chk_shipping_methods_estimated_days",
      sql`${table.estimatedDays} IS NULL OR ${table.estimatedDays} >= 0`
    ),
    check(
      "chk_shipping_methods_min_days",
      sql`${table.minDays} IS NULL OR ${table.minDays} >= 0`
    ),
    check(
      "chk_shipping_methods_max_days",
      sql`${table.maxDays} IS NULL OR ${table.maxDays} >= 0`
    ),
    check(
      "chk_shipping_methods_range",
      sql`${table.minDays} IS NULL OR ${table.maxDays} IS NULL OR ${table.maxDays} >= ${table.minDays}`
    ),
  ]
);
