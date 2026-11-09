import {
  eq,
  and,
  or,
  ilike,
  isNull,
  desc,
  asc,
  sql,
  inArray,
} from "drizzle-orm";
import { db } from "../../db/index.ts";
import {
  products,
  productCategories,
  productColors,
  productVariants,
  productImages,
} from "../../db/schema/catalog.ts";
import { inventory, inventoryMovements } from "../../db/schema/inventory.ts";
import type { DatabaseExecutor } from "./base.repository.ts";
import {
  buildPaginationOffset,
  buildPaginatedResult,
} from "./base.repository.ts";
import type { PaginatedResult } from "../types.ts";
import type { ProductFilterInput } from "../validation/catalog.ts";

export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  status: "draft" | "active" | "archived";
  brand: string | null;
  gender: string | null;
  isEngravable: boolean;
  isFeatured: boolean;
  category: {
    id: string;
    name: string;
    slug: string;
  } | null;
  primaryImage: {
    url: string;
    thumbnailUrl: string | null;
    altText: string | null;
  } | null;
  colorCount: number;
  variantCount: number;
  totalStock: number;
  minPrice: number;
  maxPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductDetailBundle {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  brand: string | null;
  gender: string | null;
  material: string | null;
  isEngravable: boolean;
  isFeatured: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  category: {
    id: string;
    name: string;
    slug: string;
  } | null;
  colors: Array<{
    id: string;
    name: string;
    hexCode: string | null;
    sortOrder: number;
  }>;
  variants: Array<{
    id: string;
    colorId: string | null;
    colorName: string | null;
    colorHex: string | null;
    sku: string;
    name: string;
    size: string | null;
    price: number;
    compareAtPrice: number | null;
    stock: number;
    reserved: number;
    reorderLevel: number;
    isActive: boolean;
    attributes: Record<string, unknown>;
  }>;
  images: Array<{
    id: string;
    imagekitFileId: string | null;
    url: string;
    thumbnailUrl: string | null;
    altText: string | null;
    colorId: string | null;
    sortOrder: number;
  }>;
}

export class ProductRepository {
  /**
   * Filtered, paginated catalog query for product listing tables.
   */
  async findPaginated(
    filter: ProductFilterInput,
    executor: DatabaseExecutor = db
  ): Promise<PaginatedResult<ProductListItem>> {
    const conditions = [];

    // Filter out soft-deleted products unless specifically searching for archived
    if (filter.status === "archived") {
      conditions.push(eq(products.status, "archived"));
    } else {
      conditions.push(isNull(products.deletedAt));
      if (filter.status) {
        conditions.push(eq(products.status, filter.status));
      }
    }

    if (filter.categoryId) {
      conditions.push(eq(products.categoryId, filter.categoryId));
    }

    if (filter.gender) {
      conditions.push(eq(products.gender, filter.gender));
    }

    if (filter.isFeatured !== undefined) {
      conditions.push(eq(products.isFeatured, filter.isFeatured));
    }

    // BUG-014: Filter by inStock (available stock = quantityOnHand - quantityReserved > 0)
    if (filter.inStock === true) {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM inventory i
        JOIN product_variants pv ON pv.id = i.variant_id
        WHERE pv.product_id = ${products.id}
          AND (i.quantity_on_hand - i.quantity_reserved) > 0
      )`);
    } else if (filter.inStock === false) {
      conditions.push(sql`NOT EXISTS (
        SELECT 1 FROM inventory i
        JOIN product_variants pv ON pv.id = i.variant_id
        WHERE pv.product_id = ${products.id}
          AND (i.quantity_on_hand - i.quantity_reserved) > 0
      )`);
    }

    // Text search on name, description, slug
    if (filter.q) {
      const pattern = `%${filter.q}%`;
      conditions.push(
        or(
          ilike(products.name, pattern),
          ilike(products.slug, pattern),
          ilike(products.description, pattern)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 1. Total matching count
    const [countResult] = await executor
      .select({ count: sql<number>`cast(count(${products.id}) as integer)` })
      .from(products)
      .where(whereClause);

    const totalItems = Number(countResult?.count) || 0;

    // 2. Sorting
    let orderByClause;
    const sortDir = filter.sortOrder === "asc" ? asc : desc;

    switch (filter.sortBy) {
      case "name":
        orderByClause = [sortDir(products.name)];
        break;
      case "status":
        orderByClause = [sortDir(products.status)];
        break;
      case "updatedAt":
        orderByClause = [sortDir(products.updatedAt)];
        break;
      case "price":
        // BUG-014: Sort by minimum variant price
        orderByClause = [
          filter.sortOrder === "asc"
            ? sql`(SELECT MIN(pv.price) FROM product_variants pv WHERE pv.product_id = ${products.id}) ASC NULLS LAST`
            : sql`(SELECT MIN(pv.price) FROM product_variants pv WHERE pv.product_id = ${products.id}) DESC NULLS LAST`,
        ];
        break;
      case "createdAt":
      default:
        orderByClause = [sortDir(products.createdAt)];
        break;
    }

    const offset = buildPaginationOffset(filter.page, filter.limit);

    // 3. Paginated product IDs
    const matchedProducts = await executor
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        status: products.status,
        brand: products.brand,
        gender: products.gender,
        isEngravable: products.isEngravable,
        isFeatured: products.isFeatured,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        category: {
          id: productCategories.id,
          name: productCategories.name,
          slug: productCategories.slug,
        },
      })
      .from(products)
      .leftJoin(productCategories, eq(productCategories.id, products.categoryId))
      .where(whereClause)
      .orderBy(...orderByClause)
      .limit(filter.limit)
      .offset(offset);

    if (matchedProducts.length === 0) {
      return buildPaginatedResult([], totalItems, filter.page, filter.limit);
    }

    const productIds = matchedProducts.map((p) => p.id);

    // PERF-003: Parallelize follow-up queries (variants, images, colors)
    const [variantsData, imagesData, colorsData] = await Promise.all([
      // 4. Fetch variants and aggregated inventory for these products (BUG-015: available stock = greatest(onHand - reserved, 0))
      executor
        .select({
          productId: productVariants.productId,
          price: productVariants.price,
          onHand: inventory.quantityOnHand,
          reserved: inventory.quantityReserved,
          stock: sql<number>`greatest(coalesce(${inventory.quantityOnHand}, 0) - coalesce(${inventory.quantityReserved}, 0), 0)::int`,
        })
        .from(productVariants)
        .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
        .where(inArray(productVariants.productId, productIds)),

      // 5. Fetch primary images (lowest sortOrder per product)
      executor
        .select({
          productId: productImages.productId,
          url: productImages.url,
          thumbnailUrl: productImages.thumbnailUrl,
          altText: productImages.altText,
          sortOrder: productImages.sortOrder,
        })
        .from(productImages)
        .where(inArray(productImages.productId, productIds))
        .orderBy(productImages.sortOrder),

      // 6. Fetch color counts
      executor
        .select({
          productId: productColors.productId,
          colorId: productColors.id,
        })
        .from(productColors)
        .where(inArray(productColors.productId, productIds)),
    ]);

    // Map aggregated metrics
    const items: ProductListItem[] = matchedProducts.map((p) => {
      const pVariants = variantsData.filter((v) => v.productId === p.id);
      const pImages = imagesData.filter((img) => img.productId === p.id);
      const pColors = colorsData.filter((c) => c.productId === p.id);

      const prices = pVariants.map((v) => Number(v.price) || 0);
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
      const totalStock = pVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

      const primaryImg = pImages[0]
        ? {
            url: pImages[0].url,
            thumbnailUrl: pImages[0].thumbnailUrl,
            altText: pImages[0].altText,
          }
        : null;

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status as "draft" | "active" | "archived",
        brand: p.brand,
        gender: p.gender,
        isEngravable: p.isEngravable,
        isFeatured: p.isFeatured,
        category: p.category?.id ? p.category : null,
        primaryImage: primaryImg,
        colorCount: pColors.length,
        variantCount: pVariants.length,
        totalStock,
        minPrice,
        maxPrice,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });

    return buildPaginatedResult(items, totalItems, filter.page, filter.limit);
  }

  /**
   * Retrieves complete product bundle by UUID.
   */
  async findById(
    id: string,
    executor: DatabaseExecutor = db
  ): Promise<ProductDetailBundle | null> {
    const [productRow] = await executor
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        description: products.description,
        status: products.status,
        brand: products.brand,
        gender: products.gender,
        material: products.material,
        isEngravable: products.isEngravable,
        isFeatured: products.isFeatured,
        deletedAt: products.deletedAt,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        category: {
          id: productCategories.id,
          name: productCategories.name,
          slug: productCategories.slug,
        },
      })
      .from(products)
      .leftJoin(productCategories, eq(productCategories.id, products.categoryId))
      .where(eq(products.id, id))
      .limit(1);

    if (!productRow) return null;

    // Colors
    const colors = await executor
      .select({
        id: productColors.id,
        name: productColors.name,
        hexCode: productColors.hexCode,
        sortOrder: productColors.sortOrder,
      })
      .from(productColors)
      .where(eq(productColors.productId, id))
      .orderBy(productColors.sortOrder);

    // Variants with Inventory
    const variants = await executor
      .select({
        id: productVariants.id,
        colorId: productVariants.colorId,
        colorName: productColors.name,
        colorHex: productColors.hexCode,
        sku: productVariants.sku,
        name: productVariants.name,
        size: productVariants.size,
        price: productVariants.price,
        compareAtPrice: productVariants.compareAtPrice,
        attributes: productVariants.attributes,
        isActive: productVariants.isActive,
        stock: inventory.quantityOnHand,
        reserved: inventory.quantityReserved,
        reorderLevel: inventory.reorderLevel,
      })
      .from(productVariants)
      .leftJoin(productColors, eq(productColors.id, productVariants.colorId))
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(eq(productVariants.productId, id));

    // Images
    const images = await executor
      .select({
        id: productImages.id,
        imagekitFileId: productImages.imagekitFileId,
        url: productImages.url,
        thumbnailUrl: productImages.thumbnailUrl,
        altText: productImages.altText,
        colorId: productImages.colorId,
        sortOrder: productImages.sortOrder,
      })
      .from(productImages)
      .where(eq(productImages.productId, id))
      .orderBy(productImages.sortOrder);

    return {
      ...productRow,
      status: productRow.status as "draft" | "active" | "archived",
      category: productRow.category?.id ? productRow.category : null,
      colors,
      variants: variants.map((v) => ({
        ...v,
        price: Number(v.price) || 0,
        compareAtPrice: v.compareAtPrice ? Number(v.compareAtPrice) : null,
        stock: Number(v.stock) || 0,
        reserved: Number(v.reserved) || 0,
        reorderLevel: Number(v.reorderLevel) || 0,
        attributes: (v.attributes as Record<string, unknown>) || {},
      })),
      images,
    };
  }

  /**
   * Retrieves complete product bundle by unique slug.
   */
  async findBySlug(
    slug: string,
    executor: DatabaseExecutor = db
  ): Promise<ProductDetailBundle | null> {
    const [row] = await executor
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);

    if (!row) return null;
    return this.findById(row.id, executor);
  }

  /**
   * Checks whether a slug is already taken (excluding optional ignoreId).
   */
  async isSlugTaken(
    slug: string,
    ignoreId?: string,
    executor: DatabaseExecutor = db
  ): Promise<boolean> {
    const conditions = [eq(products.slug, slug)];
    if (ignoreId) {
      conditions.push(sql`${products.id} != ${ignoreId}`);
    }

    const [row] = await executor
      .select({ id: products.id })
      .from(products)
      .where(and(...conditions))
      .limit(1);

    return Boolean(row);
  }

  /**
   * Inserts base product row.
   */
  async createProductRow(
    data: {
      name: string;
      slug: string;
      description?: string | null;
      categoryId?: string | null;
      brand?: string | null;
      gender?: "men" | "women" | "unisex" | null;
      material?: string | null;
      status?: "draft" | "active" | "archived";
      isEngravable?: boolean;
      isFeatured?: boolean;
    },
    executor: DatabaseExecutor
  ) {
    const [created] = await executor
      .insert(products)
      .values({
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        categoryId: data.categoryId || null,
        brand: data.brand || null,
        gender: data.gender || null,
        material: data.material || null,
        status: data.status || "draft",
        isEngravable: data.isEngravable ?? false,
        isFeatured: data.isFeatured ?? false,
      })
      .returning();

    return created;
  }

  /**
   * Updates base product row.
   */
  async updateProductRow(
    id: string,
    data: Partial<{
      name: string;
      slug: string;
      description: string | null;
      categoryId: string | null;
      brand: string | null;
      gender: "men" | "women" | "unisex" | null;
      material: string | null;
      status: "draft" | "active" | "archived";
      isEngravable: boolean;
      isFeatured: boolean;
    }>,
    executor: DatabaseExecutor
  ) {
    const [updated] = await executor
      .update(products)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .returning();

    return updated;
  }

  /**
   * Soft deletes / archives a product.
   */
  async softDelete(id: string, executor: DatabaseExecutor = db) {
    const [archived] = await executor
      .update(products)
      .set({
        deletedAt: new Date(),
        status: "archived",
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .returning();

    return archived;
  }

  /**
   * Permanently deletes product and all cascading child rows.
   */
  async permanentDelete(id: string, executor: DatabaseExecutor = db) {
    const [deleted] = await executor
      .delete(products)
      .where(eq(products.id, id))
      .returning();

    return deleted;
  }
}

export const productRepository = new ProductRepository();
