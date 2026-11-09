import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { baUser } from "./auth.ts";
import { productVariants } from "./catalog.ts";
import { orders } from "./orders.ts";

/**
 * Inventory Management & Real-Time Stock Ledger
 *
 * Available stock is computed dynamically: (quantity_on_hand - quantity_reserved).
 * Triggers: updated_at maintained automatically.
 * Security: RLS is enabled with zero direct public access.
 */

export const inventory = pgTable(
  "inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" })
      .unique(),
    quantityOnHand: integer("quantity_on_hand").notNull().default(0),
    quantityReserved: integer("quantity_reserved").notNull().default(0),
    reorderLevel: integer("reorder_level").notNull().default(5),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_inventory_updated").on(table.updatedAt.desc()),
    check("chk_inventory_on_hand", sql`${table.quantityOnHand} >= 0`),
    check(
      "chk_inventory_reserved",
      sql`${table.quantityReserved} >= 0 AND ${table.quantityReserved} <= ${table.quantityOnHand}`
    ),
    check("chk_inventory_reorder", sql`${table.reorderLevel} >= 0`),
  ]
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    change: integer("change").notNull(), // Positive (restock/return) or negative (sale)
    reason: text("reason").notNull(), // 'restock' | 'sale' | 'cancellation' | 'adjustment' | 'return'
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => baUser.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_inventory_movements_variant").on(table.variantId),
    index("idx_inventory_movements_created").on(table.createdAt.desc()),
    index("idx_inventory_movements_variant_created").on(table.variantId, table.createdAt.desc()),
    check(
      "chk_inventory_movements_reason",
      sql`${table.reason} IN ('restock', 'sale', 'cancellation', 'adjustment', 'return', 'correction')`
    ),
  ]
);
