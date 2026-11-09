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
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { productStatusEnum } from "./enums.ts";
import type { VariantAttributes } from "./json-types.ts";

/**
 * Catalog Domain: Categories, Products, Colors, Variants, and Images.
 *
 * Triggers: updated_at is maintained automatically via update_updated_at_column().
 * RLS: Enabled across all catalog tables (see migration).
 */

export const productCategories = pgTable("product_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentId: uuid("parent_id").references((): any => productCategories.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  imageUrl: text("image_url"),
  imageFileId: text("image_file_id"), // ImageKit file ID for asset lifecycle management
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    status: productStatusEnum("status").notNull().default("draft"),
    categoryId: uuid("category_id").references(() => productCategories.id, {
      onDelete: "set null",
    }),
    brand: text("brand"),
    gender: text("gender"), // 'men' | 'women' | 'unisex'
    material: text("material"),
    isEngravable: boolean("is_engravable").notNull().default(false),
    isFeatured: boolean("is_featured").notNull().default(false), // Admin UI featured toggle
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_products_category_id").on(table.categoryId),
    index("idx_products_status").on(table.status),
    check(
      "chk_products_gender",
      sql`${table.gender} IS NULL OR ${table.gender} IN ('men', 'women', 'unisex')`
    ),
  ]
);

export const productColors = pgTable(
  "product_colors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    hexCode: text("hex_code"), // Format #RRGGBB
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_product_colors_product_name").on(table.productId, table.name),
    index("idx_product_colors_product_id").on(table.productId),
    check(
      "chk_product_colors_hex",
      sql`${table.hexCode} IS NULL OR ${table.hexCode} ~* '^#[0-9a-f]{6}$'`
    ),
  ]
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    colorId: uuid("color_id").references(() => productColors.id, {
      onDelete: "set null",
    }),
    sku: text("sku").notNull().unique(),
    name: text("name").notNull(),
    size: text("size"),
    sizeSortOrder: integer("size_sort_order").notNull().default(0),
    /** Monetary values are numeric(12,2) in PKR, handled as strings in TypeScript */
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    compareAtPrice: numeric("compare_at_price", { precision: 12, scale: 2 }),
    attributes: jsonb("attributes").$type<VariantAttributes>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uq_product_variants_combo").on(table.productId, table.colorId, table.size),
    index("idx_product_variants_product_id").on(table.productId),
    index("idx_product_variants_color_id").on(table.colorId),
    index("idx_variants_product_price").on(table.productId, table.price),
    check("chk_product_variants_price", sql`${table.price} >= 0`),
    check(
      "chk_product_variants_compare_price",
      sql`${table.compareAtPrice} IS NULL OR ${table.compareAtPrice} >= 0`
    ),
  ]
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    colorId: uuid("color_id").references(() => productColors.id, {
      onDelete: "cascade",
    }),
    imagekitFileId: text("imagekit_file_id"),
    url: text("url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    altText: text("alt_text"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_product_images_lookup").on(table.productId, table.colorId, table.sortOrder),
    index("idx_product_images_file_id").on(table.imagekitFileId),
    check("chk_product_images_sort_order", sql`${table.sortOrder} >= 0`),
  ]
);
