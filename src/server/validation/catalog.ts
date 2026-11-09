import { z } from "zod";
import {
  uuidSchema,
  slugSchema,
  pricePkrSchema,
  quantitySchema,
} from "./common.ts";

// ============================================================================
// 1. Category Validation Schemas
// ============================================================================

export const createCategorySchema = z.object({
  name: z.string().trim().min(2, "Category name must be at least 2 characters.").max(100),
  slug: slugSchema,
  parentId: uuidSchema.nullable().optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  imageUrl: z.string().trim().optional().nullable(),
  imageFileId: z.string().trim().optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(2, "Category name must be at least 2 characters.").max(100).optional(),
  slug: slugSchema.optional(),
  parentId: uuidSchema.nullable().optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  imageUrl: z.string().trim().optional().nullable(),
  imageFileId: z.string().trim().optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const deleteCategorySchema = z.object({
  id: uuidSchema,
  reassignToCategoryId: uuidSchema.nullable().optional(),
});

export type DeleteCategoryInput = z.infer<typeof deleteCategorySchema>;

export const getCategoryByIdSchema = z.object({
  id: uuidSchema,
});

export const categoryFilterSchema = z.object({
  includeProductCounts: z.boolean().optional(),
  activeOnly: z.boolean().optional(),
  tree: z.boolean().optional(),
});

export type CategoryFilterInput = z.infer<typeof categoryFilterSchema>;

export const toggleCategoryStatusSchema = z.object({
  id: uuidSchema,
});

export type ToggleCategoryStatusInput = z.infer<typeof toggleCategoryStatusSchema>;

// ============================================================================
// 2. Product Sub-Entities Schemas
// ============================================================================

export const productColorInputSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(1, "Color name is required.").max(50),
  hexCode: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i, "Hex code must be in #RRGGBB format.")
    .optional()
    .nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

export type ProductColorInput = z.infer<typeof productColorInputSchema>;

export const productVariantInputSchema = z.object({
  id: uuidSchema.optional(),
  colorId: uuidSchema.nullable().optional(),
  colorName: z.string().trim().optional(),
  size: z.string().trim().min(1, "Size is required.").max(30),
  sku: z.string().trim().min(3, "SKU must be at least 3 characters.").max(60),
  name: z.string().trim().min(1, "Variant name is required.").max(100),
  price: pricePkrSchema,
  compareAtPrice: pricePkrSchema.optional().nullable(),
  stock: quantitySchema.optional(),
  reorderLevel: quantitySchema.optional(),
  isActive: z.boolean().optional(),
  attributes: z
    .object({
      manual: z.boolean().optional(),
    })
    .optional(),
});

export type ProductVariantInput = z.infer<typeof productVariantInputSchema>;

export const productImageInputSchema = z.object({
  id: uuidSchema.optional(),
  imagekitFileId: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid ImageKit file ID format.")
    .max(128)
    .optional()
    .nullable(),
  url: z.string().trim().url("Valid URL required.").max(2048),
  thumbnailUrl: z.string().trim().url().max(2048).optional().nullable(),
  altText: z.string().trim().max(255).optional().nullable(),
  colorId: uuidSchema.nullable().optional(),
  colorName: z.string().trim().max(100).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export type ProductImageInput = z.infer<typeof productImageInputSchema>;

// ============================================================================
// 3. Product Core Schemas
// ============================================================================

export const createProductSchema = z.object({
  name: z.string().trim().min(2, "Product name must be at least 2 characters.").max(200),
  slug: slugSchema,
  description: z.string().trim().max(10000).optional().nullable(),
  categoryId: uuidSchema.nullable().optional(),
  brand: z.string().trim().max(100).optional().nullable(),
  gender: z.enum(["men", "women", "unisex"]).nullable().optional(),
  material: z.string().trim().max(100).optional().nullable(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  isEngravable: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  colors: z.array(productColorInputSchema).optional(),
  variants: z
    .array(productVariantInputSchema)
    .min(1, "At least one product variant must be configured."),
  images: z.array(productImageInputSchema).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(2, "Product name must be at least 2 characters.").max(200).optional(),
  slug: slugSchema.optional(),
  description: z.string().trim().max(10000).optional().nullable(),
  categoryId: uuidSchema.nullable().optional(),
  brand: z.string().trim().max(100).optional().nullable(),
  gender: z.enum(["men", "women", "unisex"]).nullable().optional(),
  material: z.string().trim().max(100).optional().nullable(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  isEngravable: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  colors: z.array(productColorInputSchema).optional(),
  variants: z.array(productVariantInputSchema).optional(),
  images: z.array(productImageInputSchema).optional(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: uuidSchema.optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  gender: z.enum(["men", "women", "unisex"]).optional(),
  isFeatured: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .transform((v) => (typeof v === "boolean" ? v : v === "true"))
    .optional(),
  inStock: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .transform((v) => (typeof v === "boolean" ? v : v === "true"))
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["name", "createdAt", "updatedAt", "price", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ProductFilterInput = z.infer<typeof productFilterSchema>;

export const getProductByIdSchema = z.object({
  id: uuidSchema,
});

export const archiveProductSchema = z.object({
  id: uuidSchema,
});

export type ArchiveProductInput = z.infer<typeof archiveProductSchema>;

export const deleteProductSchema = z.object({
  id: uuidSchema,
});

export type DeleteProductInput = z.infer<typeof deleteProductSchema>;

export const detachProductImageSchema = z.object({
  productId: uuidSchema,
  imageId: uuidSchema,
});

export type DetachProductImageInput = z.infer<typeof detachProductImageSchema>;

