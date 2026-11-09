import {
  eq,
  and,
  or,
  ilike,
  isNull,
  desc,
  asc,
  sql,
  count,
} from "drizzle-orm";
import { db } from "../../db/index.ts";
import {
  inventory,
  inventoryMovements,
} from "../../db/schema/inventory.ts";
import {
  products,
  productCategories,
  productColors,
  productVariants,
} from "../../db/schema/catalog.ts";
import { orders } from "../../db/schema/orders.ts";
import { baUser } from "../../db/schema/auth.ts";
import type { DatabaseExecutor } from "./base.repository.ts";
import {
  buildPaginationOffset,
  buildPaginatedResult,
} from "./base.repository.ts";
import type { PaginatedResult } from "../types.ts";
import type {
  InventoryFilterInput,
  InventoryMovementFilterInput,
} from "../validation/inventory.ts";

export interface InventoryItem {
  id: string;
  variantId: string;
  quantityOnHand: number;
  quantityReserved: number;
  availableStock: number;
  reorderLevel: number;
  stockStatus: "out" | "low" | "healthy";
  updatedAt: Date;
  variant: {
    id: string;
    sku: string;
    name: string;
    size: string | null;
    price: number;
    compareAtPrice: number | null;
    isActive: boolean;
  };
  product: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  color: {
    id: string;
    name: string;
    hexCode: string | null;
  } | null;
  category: {
    id: string;
    name: string;
    slug: string;
  } | null;
  stockValue: number;
}

export interface InventorySummaryMetrics {
  totalUnitsInStock: number;
  totalReservedUnits: number;
  totalStockValue: number;
  totalSkus: number;
  lowStockCount: number;
  outOfStockCount: number;
  healthyStockCount: number;
}

export interface InventoryMovementItem {
  id: string;
  variantId: string;
  change: number;
  reason: "restock" | "sale" | "cancellation" | "adjustment" | "return";
  orderId: string | null;
  createdBy: string | null;
  createdAt: Date;
  variant: {
    id: string;
    sku: string;
    name: string;
    size: string | null;
  };
  product: {
    id: string;
    name: string;
    slug: string;
  };
  color: {
    name: string;
    hexCode: string | null;
  } | null;
  order?: {
    id: string;
    orderNumber: string;
  } | null;
  createdByUser?: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
}

export class InventoryRepository {
  /**
   * Retrieves paginated, filtered inventory rows joining variants, products, colors, and categories.
   */
  async findPaginated(
    filter: InventoryFilterInput,
    executor: DatabaseExecutor = db
  ): Promise<PaginatedResult<InventoryItem>> {
    const conditions = [isNull(products.deletedAt)];

    // 1. Text Search across product name, variant SKU, variant name, color name, and size
    if (filter.q) {
      const term = `%${filter.q}%`;
      conditions.push(
        or(
          ilike(products.name, term),
          ilike(productVariants.sku, term),
          ilike(productVariants.name, term),
          ilike(productColors.name, term),
          ilike(productVariants.size, term)
        )!
      );
    }

    // 2. Category filter
    if (filter.categoryId) {
      conditions.push(eq(products.categoryId, filter.categoryId));
    }

    // 3. Stock Status filter:
    // available = (quantityOnHand - quantityReserved)
    if (filter.status === "low") {
      conditions.push(
        sql`(${inventory.quantityOnHand} - ${inventory.quantityReserved}) > 0 AND (${inventory.quantityOnHand} - ${inventory.quantityReserved}) <= ${inventory.reorderLevel}`
      );
    } else if (filter.status === "out") {
      conditions.push(
        sql`(${inventory.quantityOnHand} - ${inventory.quantityReserved}) <= 0`
      );
    } else if (filter.status === "healthy") {
      conditions.push(
        sql`(${inventory.quantityOnHand} - ${inventory.quantityReserved}) > ${inventory.reorderLevel}`
      );
    }

    const whereClause = and(...conditions);

    // 4. Count total items
    const [countResult] = await executor
      .select({ val: count() })
      .from(inventory)
      .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(productColors, eq(productColors.id, productVariants.colorId))
      .leftJoin(productCategories, eq(productCategories.id, products.categoryId))
      .where(whereClause);

    const totalItems = Number(countResult?.val) || 0;
    const safePage = filter.page ?? 1;
    const safeLimit = filter.limit ?? 20;

    if (totalItems === 0) {
      return buildPaginatedResult([], totalItems, safePage, safeLimit);
    }

    // 5. Dynamic Sorting
    const sortDirection = filter.sortOrder === "asc" ? asc : desc;
    let orderExpression;

    switch (filter.sortBy) {
      case "productName":
        orderExpression = sortDirection(products.name);
        break;
      case "sku":
        orderExpression = sortDirection(productVariants.sku);
        break;
      case "stock":
        orderExpression = sortDirection(inventory.quantityOnHand);
        break;
      case "available":
        orderExpression = sortDirection(
          sql`(${inventory.quantityOnHand} - ${inventory.quantityReserved})`
        );
        break;
      case "reserved":
        orderExpression = sortDirection(inventory.quantityReserved);
        break;
      case "reorderLevel":
        orderExpression = sortDirection(inventory.reorderLevel);
        break;
      case "price":
        orderExpression = sortDirection(productVariants.price);
        break;
      case "updatedAt":
      default:
        orderExpression = sortDirection(inventory.updatedAt);
        break;
    }

    const offset = buildPaginationOffset(safePage, safeLimit);

    // 6. Execute data query
    const rows = await executor
      .select({
        id: inventory.id,
        variantId: inventory.variantId,
        quantityOnHand: inventory.quantityOnHand,
        quantityReserved: inventory.quantityReserved,
        reorderLevel: inventory.reorderLevel,
        updatedAt: inventory.updatedAt,
        variantIdCol: productVariants.id,
        variantSku: productVariants.sku,
        variantName: productVariants.name,
        variantSize: productVariants.size,
        variantPrice: productVariants.price,
        variantCompareAtPrice: productVariants.compareAtPrice,
        variantIsActive: productVariants.isActive,
        productId: products.id,
        productName: products.name,
        productSlug: products.slug,
        productStatus: products.status,
        colorId: productColors.id,
        colorName: productColors.name,
        colorHex: productColors.hexCode,
        categoryId: productCategories.id,
        categoryName: productCategories.name,
        categorySlug: productCategories.slug,
      })
      .from(inventory)
      .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(productColors, eq(productColors.id, productVariants.colorId))
      .leftJoin(productCategories, eq(productCategories.id, products.categoryId))
      .where(whereClause)
      .orderBy(orderExpression)
      .limit(safeLimit)
      .offset(offset);

    const items: InventoryItem[] = rows.map((r) => {
      const onHand = r.quantityOnHand;
      const reserved = r.quantityReserved;
      const available = onHand - reserved;
      const price = Number(r.variantPrice) || 0;

      let stockStatus: "out" | "low" | "healthy";
      if (available <= 0) {
        stockStatus = "out";
      } else if (available <= r.reorderLevel) {
        stockStatus = "low";
      } else {
        stockStatus = "healthy";
      }

      return {
        id: r.id,
        variantId: r.variantId,
        quantityOnHand: onHand,
        quantityReserved: reserved,
        availableStock: available,
        reorderLevel: r.reorderLevel,
        stockStatus,
        updatedAt: r.updatedAt,
        variant: {
          id: r.variantIdCol,
          sku: r.variantSku,
          name: r.variantName,
          size: r.variantSize,
          price,
          compareAtPrice: r.variantCompareAtPrice != null ? Number(r.variantCompareAtPrice) : null,
          isActive: r.variantIsActive,
        },
        product: {
          id: r.productId,
          name: r.productName,
          slug: r.productSlug,
          status: r.productStatus,
        },
        color: r.colorId
          ? {
              id: r.colorId,
              name: r.colorName!,
              hexCode: r.colorHex,
            }
          : null,
        category: r.categoryId
          ? {
              id: r.categoryId,
              name: r.categoryName!,
              slug: r.categorySlug!,
            }
          : null,
        stockValue: Number((onHand * price).toFixed(2)),
      };
    });

    return buildPaginatedResult(items, totalItems, safePage, safeLimit);
  }

  /**
   * Calculates overall stock KPI statistics across all active catalog products.
   */
  async getSummaryMetrics(executor: DatabaseExecutor = db): Promise<InventorySummaryMetrics> {
    const [summary] = await executor
      .select({
        totalUnits: sql<number>`coalesce(sum(${inventory.quantityOnHand}), 0)`,
        totalReserved: sql<number>`coalesce(sum(${inventory.quantityReserved}), 0)`,
        totalValue: sql<number>`coalesce(sum(cast(${inventory.quantityOnHand} * cast(${productVariants.price} as numeric) as numeric(14,2))), 0)`,
        totalSkus: sql<number>`count(${inventory.id})`,
        lowStock: sql<number>`cast(count(*) filter (where (${inventory.quantityOnHand} - ${inventory.quantityReserved}) > 0 and (${inventory.quantityOnHand} - ${inventory.quantityReserved}) <= ${inventory.reorderLevel}) as integer)`,
        outOfStock: sql<number>`cast(count(*) filter (where (${inventory.quantityOnHand} - ${inventory.quantityReserved}) <= 0) as integer)`,
        healthyStock: sql<number>`cast(count(*) filter (where (${inventory.quantityOnHand} - ${inventory.quantityReserved}) > ${inventory.reorderLevel}) as integer)`,
      })
      .from(inventory)
      .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(isNull(products.deletedAt));

    return {
      totalUnitsInStock: Number(summary?.totalUnits) || 0,
      totalReservedUnits: Number(summary?.totalReserved) || 0,
      totalStockValue: Number(summary?.totalValue) || 0,
      totalSkus: Number(summary?.totalSkus) || 0,
      lowStockCount: Number(summary?.lowStock) || 0,
      outOfStockCount: Number(summary?.outOfStock) || 0,
      healthyStockCount: Number(summary?.healthyStock) || 0,
    };
  }

  /**
   * Retrieves single inventory record for a specific variant with deep relations.
   */
  async findByVariantId(
    variantId: string,
    executor: DatabaseExecutor = db
  ): Promise<InventoryItem | null> {
    const [row] = await executor
      .select({
        id: inventory.id,
        variantId: inventory.variantId,
        quantityOnHand: inventory.quantityOnHand,
        quantityReserved: inventory.quantityReserved,
        reorderLevel: inventory.reorderLevel,
        updatedAt: inventory.updatedAt,
        variantIdCol: productVariants.id,
        variantSku: productVariants.sku,
        variantName: productVariants.name,
        variantSize: productVariants.size,
        variantPrice: productVariants.price,
        variantCompareAtPrice: productVariants.compareAtPrice,
        variantIsActive: productVariants.isActive,
        productId: products.id,
        productName: products.name,
        productSlug: products.slug,
        productStatus: products.status,
        colorId: productColors.id,
        colorName: productColors.name,
        colorHex: productColors.hexCode,
        categoryId: productCategories.id,
        categoryName: productCategories.name,
        categorySlug: productCategories.slug,
      })
      .from(inventory)
      .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(productColors, eq(productColors.id, productVariants.colorId))
      .leftJoin(productCategories, eq(productCategories.id, products.categoryId))
      .where(and(eq(inventory.variantId, variantId), isNull(products.deletedAt)))
      .limit(1);

    if (!row) return null;

    const onHand = row.quantityOnHand;
    const reserved = row.quantityReserved;
    const available = onHand - reserved;
    const price = Number(row.variantPrice) || 0;

    let stockStatus: "out" | "low" | "healthy";
    if (available <= 0) {
      stockStatus = "out";
    } else if (available <= row.reorderLevel) {
      stockStatus = "low";
    } else {
      stockStatus = "healthy";
    }

    return {
      id: row.id,
      variantId: row.variantId,
      quantityOnHand: onHand,
      quantityReserved: reserved,
      availableStock: available,
      reorderLevel: row.reorderLevel,
      stockStatus,
      updatedAt: row.updatedAt,
      variant: {
        id: row.variantIdCol,
        sku: row.variantSku,
        name: row.variantName,
        size: row.variantSize,
        price,
        compareAtPrice:
          row.variantCompareAtPrice != null ? Number(row.variantCompareAtPrice) : null,
        isActive: row.variantIsActive,
      },
      product: {
        id: row.productId,
        name: row.productName,
        slug: row.productSlug,
        status: row.productStatus,
      },
      color: row.colorId
        ? {
            id: row.colorId,
            name: row.colorName!,
            hexCode: row.colorHex,
          }
        : null,
      category: row.categoryId
        ? {
            id: row.categoryId,
            name: row.categoryName!,
            slug: row.categorySlug!,
          }
        : null,
      stockValue: Number((onHand * price).toFixed(2)),
    };
  }

  /**
   * Retrieves all variant inventory records for a given product.
   */
  async findByProductId(
    productId: string,
    executor: DatabaseExecutor = db
  ): Promise<InventoryItem[]> {
    const rows = await executor
      .select({
        id: inventory.id,
        variantId: inventory.variantId,
        quantityOnHand: inventory.quantityOnHand,
        quantityReserved: inventory.quantityReserved,
        reorderLevel: inventory.reorderLevel,
        updatedAt: inventory.updatedAt,
        variantIdCol: productVariants.id,
        variantSku: productVariants.sku,
        variantName: productVariants.name,
        variantSize: productVariants.size,
        variantPrice: productVariants.price,
        variantCompareAtPrice: productVariants.compareAtPrice,
        variantIsActive: productVariants.isActive,
        productId: products.id,
        productName: products.name,
        productSlug: products.slug,
        productStatus: products.status,
        colorId: productColors.id,
        colorName: productColors.name,
        colorHex: productColors.hexCode,
        categoryId: productCategories.id,
        categoryName: productCategories.name,
        categorySlug: productCategories.slug,
      })
      .from(inventory)
      .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(productColors, eq(productColors.id, productVariants.colorId))
      .leftJoin(productCategories, eq(productCategories.id, products.categoryId))
      .where(and(eq(products.id, productId), isNull(products.deletedAt)))
      .orderBy(productVariants.sku);

    return rows.map((row) => {
      const onHand = row.quantityOnHand;
      const reserved = row.quantityReserved;
      const available = onHand - reserved;
      const price = Number(row.variantPrice) || 0;

      let stockStatus: "out" | "low" | "healthy";
      if (available <= 0) {
        stockStatus = "out";
      } else if (available <= row.reorderLevel) {
        stockStatus = "low";
      } else {
        stockStatus = "healthy";
      }

      return {
        id: row.id,
        variantId: row.variantId,
        quantityOnHand: onHand,
        quantityReserved: reserved,
        availableStock: available,
        reorderLevel: row.reorderLevel,
        stockStatus,
        updatedAt: row.updatedAt,
        variant: {
          id: row.variantIdCol,
          sku: row.variantSku,
          name: row.variantName,
          size: row.variantSize,
          price,
          compareAtPrice:
            row.variantCompareAtPrice != null ? Number(row.variantCompareAtPrice) : null,
          isActive: row.variantIsActive,
        },
        product: {
          id: row.productId,
          name: row.productName,
          slug: row.productSlug,
          status: row.productStatus,
        },
        color: row.colorId
          ? {
              id: row.colorId,
              name: row.colorName!,
              hexCode: row.colorHex,
            }
          : null,
        category: row.categoryId
          ? {
              id: row.categoryId,
              name: row.categoryName!,
              slug: row.categorySlug!,
            }
          : null,
        stockValue: Number((onHand * price).toFixed(2)),
      };
    });
  }

  /**
   * Acquires an exclusive row-level lock (SELECT ... FOR UPDATE) on a specific variant's inventory row.
   * MUST be executed inside an active transaction.
   */
  async findForUpdate(
    variantId: string,
    tx: DatabaseExecutor
  ): Promise<typeof inventory.$inferSelect | null> {
    const [row] = await tx
      .select()
      .from(inventory)
      .where(eq(inventory.variantId, variantId))
      .for("update")
      .limit(1);

    return row ?? null;
  }

  /**
   * Updates an existing inventory row.
   */
  async updateInventoryRow(
    id: string,
    data: {
      quantityOnHand?: number;
      quantityReserved?: number;
      reorderLevel?: number;
    },
    executor: DatabaseExecutor = db
  ): Promise<typeof inventory.$inferSelect> {
    const [updated] = await executor
      .update(inventory)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(inventory.id, id))
      .returning();

    return updated;
  }

  /**
   * Appends an audit log entry to the inventory_movements ledger.
   */
  async insertMovement(
    data: {
      variantId: string;
      change: number;
      reason: "restock" | "sale" | "cancellation" | "adjustment" | "return" | "correction";
      orderId?: string | null;
      createdBy?: string | null;
    },
    executor: DatabaseExecutor = db
  ): Promise<typeof inventoryMovements.$inferSelect> {
    const [created] = await executor
      .insert(inventoryMovements)
      .values({
        variantId: data.variantId,
        change: data.change,
        reason: data.reason,
        orderId: data.orderId || null,
        createdBy: data.createdBy || null,
      })
      .returning();

    return created;
  }

  /**
   * Retrieves paginated inventory movement history joined with variant, product, order, and admin details.
   */
  async findMovementsPaginated(
    filter: InventoryMovementFilterInput,
    executor: DatabaseExecutor = db
  ): Promise<PaginatedResult<InventoryMovementItem>> {
    const conditions = [];

    if (filter.variantId) {
      conditions.push(eq(inventoryMovements.variantId, filter.variantId));
    }

    if (filter.productId) {
      conditions.push(eq(productVariants.productId, filter.productId));
    }

    if (filter.orderId) {
      conditions.push(eq(inventoryMovements.orderId, filter.orderId));
    }

    if (filter.reason) {
      conditions.push(eq(inventoryMovements.reason, filter.reason));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total movements
    const [countResult] = await executor
      .select({ val: count() })
      .from(inventoryMovements)
      .innerJoin(productVariants, eq(productVariants.id, inventoryMovements.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(whereClause);

    const totalItems = Number(countResult?.val) || 0;
    const safePage = filter.page ?? 1;
    const safeLimit = filter.limit ?? 20;

    if (totalItems === 0) {
      return buildPaginatedResult([], totalItems, safePage, safeLimit);
    }

    const offset = buildPaginationOffset(safePage, safeLimit);

    const rows = await executor
      .select({
        id: inventoryMovements.id,
        variantId: inventoryMovements.variantId,
        change: inventoryMovements.change,
        reason: inventoryMovements.reason,
        orderId: inventoryMovements.orderId,
        createdBy: inventoryMovements.createdBy,
        createdAt: inventoryMovements.createdAt,
        variantIdCol: productVariants.id,
        variantSku: productVariants.sku,
        variantName: productVariants.name,
        variantSize: productVariants.size,
        productId: products.id,
        productName: products.name,
        productSlug: products.slug,
        colorName: productColors.name,
        colorHex: productColors.hexCode,
        orderIdCol: orders.id,
        orderNumber: orders.orderNumber,
        userId: baUser.id,
        userName: baUser.name,
        userEmail: baUser.email,
        userRole: baUser.role,
      })
      .from(inventoryMovements)
      .innerJoin(productVariants, eq(productVariants.id, inventoryMovements.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(productColors, eq(productColors.id, productVariants.colorId))
      .leftJoin(orders, eq(orders.id, inventoryMovements.orderId))
      .leftJoin(baUser, eq(baUser.id, inventoryMovements.createdBy))
      .where(whereClause)
      .orderBy(desc(inventoryMovements.createdAt))
      .limit(safeLimit)
      .offset(offset);

    const items: InventoryMovementItem[] = rows.map((r) => ({
      id: r.id,
      variantId: r.variantId,
      change: r.change,
      reason: r.reason as "restock" | "sale" | "cancellation" | "adjustment" | "return",
      orderId: r.orderId,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      variant: {
        id: r.variantIdCol,
        sku: r.variantSku,
        name: r.variantName,
        size: r.variantSize,
      },
      product: {
        id: r.productId,
        name: r.productName,
        slug: r.productSlug,
      },
      color: r.colorName
        ? {
            name: r.colorName,
            hexCode: r.colorHex,
          }
        : null,
      order: r.orderIdCol
        ? {
            id: r.orderIdCol,
            orderNumber: r.orderNumber!,
          }
        : null,
      createdByUser: r.userId
        ? {
            id: r.userId,
            name: r.userName!,
            email: r.userEmail!,
            role: r.userRole!,
          }
        : null,
    }));

    return buildPaginatedResult(items, totalItems, safePage, safeLimit);
  }
}

export const inventoryRepository = new InventoryRepository();
