import { z } from "zod";
import { uuidSchema, quantitySchema } from "./common.ts";

// ============================================================================
// 1. Inventory Query & Filter Schemas
// ============================================================================

export const inventoryStatusEnum = z.enum(["all", "low", "out", "healthy"]);
export type InventoryStatusFilter = z.infer<typeof inventoryStatusEnum>;

export const inventoryFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: uuidSchema.optional(),
  status: inventoryStatusEnum.optional().default("all"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z
    .enum([
      "productName",
      "sku",
      "stock",
      "available",
      "reserved",
      "reorderLevel",
      "price",
      "updatedAt",
    ])
    .optional()
    .default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type InventoryFilterInput = z.infer<typeof inventoryFilterSchema>;

export const getVariantInventorySchema = z.object({
  variantId: uuidSchema,
});

export type GetVariantInventoryInput = z.infer<typeof getVariantInventorySchema>;

export const getProductInventorySchema = z.object({
  productId: uuidSchema,
});

export type GetProductInventoryInput = z.infer<typeof getProductInventorySchema>;

// ============================================================================
// 2. Stock Adjustment & Restock Schemas
// ============================================================================

export const adjustStockModeEnum = z.enum(["add", "remove", "set"], {
  message: "Adjustment mode must be 'add', 'remove', or 'set'.",
});

export const inventoryMovementReasonEnum = z.enum([
  "restock",
  "adjustment",
  "sale",
  "cancellation",
  "return",
  "correction",
]);

export type InventoryMovementReason = z.infer<typeof inventoryMovementReasonEnum>;

export const adjustStockSchema = z.object({
  variantId: uuidSchema,
  mode: adjustStockModeEnum,
  quantity: quantitySchema,
  reason: inventoryMovementReasonEnum.optional(),
  notes: z.string().trim().max(500).optional(),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

export const restockSchema = z.object({
  variantId: uuidSchema,
  quantity: z.coerce
    .number({ message: "Restock quantity must be a positive integer." })
    .int("Quantity must be a whole number.")
    .min(1, "Restock quantity must be at least 1."),
  notes: z.string().trim().max(500).optional(),
});

export type RestockInput = z.infer<typeof restockSchema>;

// ============================================================================
// 3. Movement Log Filter Schema
// ============================================================================

export const inventoryMovementFilterSchema = z.object({
  variantId: uuidSchema.optional(),
  productId: uuidSchema.optional(),
  orderId: uuidSchema.optional(),
  reason: inventoryMovementReasonEnum.optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type InventoryMovementFilterInput = z.infer<typeof inventoryMovementFilterSchema>;
