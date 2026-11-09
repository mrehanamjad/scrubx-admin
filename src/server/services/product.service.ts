import { eq, and, inArray, count, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import {
  products,
  productColors,
  productVariants,
  productImages,
} from "../../db/schema/catalog.ts";
import { inventory, inventoryMovements } from "../../db/schema/inventory.ts";
import { orderItems } from "../../db/schema/orders.ts";
import { mediaUploads } from "../../db/schema/media.ts";
import {
  productRepository,
  ProductRepository,
  type ProductListItem,
  type ProductDetailBundle,
} from "../repositories/product.repository.ts";
import {
  categoryRepository,
  CategoryRepository,
} from "../repositories/category.repository.ts";
import { imagekit } from "../../lib/imagekit.ts";
import { assertRole, type AdminContext } from "../auth.ts";
import { NotFoundError, ConflictError, ValidationError } from "../errors.ts";
import type {
  CreateProductInput,
  UpdateProductInput,
  ProductFilterInput,
} from "../validation/catalog.ts";
import type { PaginatedResult } from "../types.ts";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Safely deletes a file from ImageKit without throwing unhandled exceptions
 * that could break post-transaction operations.
 * Skips fabricated placeholders and files shared with other products (BUG-021 & BUG-022).
 */
async function safeDeleteImageKitFile(fileId: string | null | undefined): Promise<void> {
  if (!fileId || fileId.startsWith("img-")) return;
  try {
    const [stillUsed] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(productImages)
      .where(eq(productImages.imagekitFileId, fileId));

    if (stillUsed && stillUsed.count > 0) {
      return;
    }

    await imagekit.deleteFile(fileId);
  } catch (err) {
    console.warn(`[ImageKit Purge Warning]: Failed to delete file '${fileId}':`, err);
  }
}

/**
 * Resolves colour database ID from local client keys, colour names, or existing UUIDs.
 * Prevents non-UUID values from ever reaching uuid columns (BUG-018 & BUG-019).
 */
function resolveColorId(
  localId: string | null | undefined,
  localName: string | null | undefined,
  colorKeyToDbId: Map<string, string>
): string | null {
  if (!localId && !localName) return null;
  if (localId) {
    const trimmedId = localId.trim();
    const mapped = colorKeyToDbId.get(trimmedId) || colorKeyToDbId.get(trimmedId.toLowerCase());
    if (mapped) return mapped;
    if (UUID_REGEX.test(trimmedId)) return trimmedId;
  }
  if (localName) {
    const trimmedName = localName.trim().toLowerCase();
    const mapped = colorKeyToDbId.get(trimmedName);
    if (mapped) return mapped;
  }
  return null;
}

export class ProductService {
  private readonly productRepo: ProductRepository;
  private readonly categoryRepo: CategoryRepository;

  constructor(
    productRepo: ProductRepository = productRepository,
    categoryRepo: CategoryRepository = categoryRepository
  ) {
    this.productRepo = productRepo;
    this.categoryRepo = categoryRepo;
  }

  /**
   * Retrieves paginated, filtered products for catalog listing tables.
   * Requires at least staff privileges.
   */
  async getProducts(
    filter: Partial<ProductFilterInput> = {},
    admin: AdminContext
  ): Promise<PaginatedResult<ProductListItem>> {
    assertRole(admin, ["staff"]);
    const normalizedFilter: ProductFilterInput = {
      page: filter.page ?? 1,
      limit: filter.limit ?? 20,
      sortBy: filter.sortBy ?? "createdAt",
      sortOrder: filter.sortOrder ?? "desc",
      ...filter,
    };
    return this.productRepo.findPaginated(normalizedFilter);
  }

  /**
   * Retrieves full product bundle (product, category, colors, variants with inventory, images) by ID.
   * Requires at least staff privileges.
   */
  async getProductById(id: string, admin: AdminContext): Promise<ProductDetailBundle> {
    assertRole(admin, ["staff"]);

    const product = await this.productRepo.findById(id);
    if (!product) {
      throw new NotFoundError("Product", id);
    }

    return product;
  }

  /**
   * Retrieves full product bundle by slug.
   * Requires at least staff privileges.
   */
  async getProductBySlug(slug: string, admin: AdminContext): Promise<ProductDetailBundle> {
    assertRole(admin, ["staff"]);

    const product = await this.productRepo.findBySlug(slug);
    if (!product) {
      throw new NotFoundError("Product with slug", slug);
    }

    return product;
  }

  /**
   * Creates a new product with colors, variants, initial inventory, and images in an atomic transaction.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async createProduct(
    input: CreateProductInput,
    admin: AdminContext
  ): Promise<ProductDetailBundle> {
    assertRole(admin, ["admin"]);

    // 1. Verify slug uniqueness
    const slugTaken = await this.productRepo.isSlugTaken(input.slug);
    if (slugTaken) {
      throw new ConflictError(`A product with slug '${input.slug}' already exists.`);
    }

    // 2. Verify category exists if specified
    if (input.categoryId) {
      const category = await this.categoryRepo.findById(input.categoryId);
      if (!category) {
        throw new NotFoundError("Category", input.categoryId);
      }
    }

    // 3. Verify variant SKUs uniqueness
    const skus = input.variants.map((v) => v.sku.trim());
    const skuSet = new Set(skus);
    if (skuSet.size !== skus.length) {
      throw new ValidationError("Duplicate SKU detected within the submitted product variants.");
    }

    const existingWithSku = await db
      .select({ sku: productVariants.sku })
      .from(productVariants)
      .where(inArray(productVariants.sku, skus));

    if (existingWithSku.length > 0) {
      throw new ConflictError(
        `SKU '${existingWithSku[0].sku}' is already in use by another product variant.`
      );
    }

    // 4. Execute atomic creation in transaction
    let createdProductId: string;

    await db.transaction(async (tx) => {
      // 4a. Create base product row
      const product = await this.productRepo.createProductRow(
        {
          name: input.name,
          slug: input.slug,
          description: input.description,
          categoryId: input.categoryId,
          brand: input.brand,
          gender: input.gender,
          material: input.material,
          status: input.status,
          isEngravable: input.isEngravable,
          isFeatured: input.isFeatured,
        },
        tx
      );

      createdProductId = product.id;

      // 4b. Insert colors & track mapped IDs
      const colorKeyToDbId = new Map<string, string>();

      if (input.colors && input.colors.length > 0) {
        for (const color of input.colors) {
          const [insertedColor] = await tx
            .insert(productColors)
            .values({
              productId: product.id,
              name: color.name.trim(),
              hexCode: color.hexCode || null,
              sortOrder: color.sortOrder ?? 0,
            })
            .returning();

          if (color.id) {
            colorKeyToDbId.set(color.id, insertedColor.id);
          }
          colorKeyToDbId.set(color.name.toLowerCase().trim(), insertedColor.id);
        }
      }

      // 4c. Insert variants, inventory rows, and restock movements
      for (const variant of input.variants) {
        const resolvedColorId = resolveColorId(variant.colorId, variant.colorName, colorKeyToDbId);

        const [insertedVariant] = await tx
          .insert(productVariants)
          .values({
            productId: product.id,
            colorId: resolvedColorId || null,
            sku: variant.sku.trim(),
            name: variant.name.trim(),
            size: variant.size || null,
            price: String(variant.price),
            compareAtPrice: variant.compareAtPrice != null ? String(variant.compareAtPrice) : null,
            isActive: variant.isActive ?? true,
            attributes: variant.attributes ?? {},
          })
          .returning();

        const stockQty = Math.max(0, variant.stock ?? 0);
        await tx.insert(inventory).values({
          variantId: insertedVariant.id,
          quantityOnHand: stockQty,
          quantityReserved: 0,
          reorderLevel: Math.max(0, variant.reorderLevel ?? 5),
        });

        if (stockQty > 0) {
          await tx.insert(inventoryMovements).values({
            variantId: insertedVariant.id,
            change: stockQty,
            reason: "restock",
            createdBy: admin.id,
          });
        }
      }

      // 4d. Insert images
      if (input.images && input.images.length > 0) {
        for (const img of input.images) {
          const resolvedImgColorId = resolveColorId(img.colorId, img.colorName, colorKeyToDbId);

          await tx.insert(productImages).values({
            productId: product.id,
            colorId: resolvedImgColorId || null,
            imagekitFileId: img.imagekitFileId || null,
            url: img.url,
            thumbnailUrl: img.thumbnailUrl || null,
            altText: img.altText || null,
            sortOrder: img.sortOrder ?? 0,
          });

          // Mark media_uploads row as attached (ECOM-008)
          if (img.imagekitFileId) {
            await tx
              .update(mediaUploads)
              .set({
                attachedAt: new Date(),
                productId: product.id,
              })
              .where(eq(mediaUploads.imagekitFileId, img.imagekitFileId));
          }
        }
      }
    });

    const fullBundle = await this.productRepo.findById(createdProductId!);
    return fullBundle!;
  }

  /**
   * Updates an existing product, reconciling colors, variants, inventory adjustments, and images.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async updateProduct(
    input: UpdateProductInput,
    admin: AdminContext
  ): Promise<ProductDetailBundle> {
    assertRole(admin, ["admin"]);

    // 1. Verify product exists
    const existing = await this.productRepo.findById(input.id);
    if (!existing) {
      throw new NotFoundError("Product", input.id);
    }

    // 2. Verify slug uniqueness if changed
    if (input.slug && input.slug !== existing.slug) {
      const taken = await this.productRepo.isSlugTaken(input.slug, input.id);
      if (taken) {
        throw new ConflictError(`A product with slug '${input.slug}' already exists.`);
      }
    }

    // 3. Verify category exists if changed
    if (input.categoryId && input.categoryId !== existing.category?.id) {
      const category = await this.categoryRepo.findById(input.categoryId);
      if (!category) {
        throw new NotFoundError("Category", input.categoryId);
      }
    }

    const imageFilesToPurge: string[] = [];

    // 4. Execute reconciliation in atomic transaction
    await db.transaction(async (tx) => {
      // 4a. Update base product row
      await this.productRepo.updateProductRow(
        input.id,
        {
          name: input.name,
          slug: input.slug,
          description: input.description,
          categoryId: input.categoryId,
          brand: input.brand,
          gender: input.gender,
          material: input.material,
          status: input.status,
          isEngravable: input.isEngravable,
          isFeatured: input.isFeatured,
        },
        tx
      );

      const colorKeyToDbId = new Map<string, string>();

      // 4b. Reconcile colors if provided
      if (input.colors !== undefined) {
        const incomingColorIds = new Set(
          input.colors.filter((c) => c.id).map((c) => c.id!)
        );
        const removedColors = existing.colors.filter(
          (c) => !incomingColorIds.has(c.id)
        );

        for (const c of input.colors) {
          if (c.id && incomingColorIds.has(c.id)) {
            await tx
              .update(productColors)
              .set({
                name: c.name.trim(),
                hexCode: c.hexCode || null,
                sortOrder: c.sortOrder ?? 0,
              })
              .where(eq(productColors.id, c.id));
            colorKeyToDbId.set(c.id, c.id);
            colorKeyToDbId.set(c.name.toLowerCase().trim(), c.id);
          } else {
            const [newColor] = await tx
              .insert(productColors)
              .values({
                productId: input.id,
                name: c.name.trim(),
                hexCode: c.hexCode || null,
                sortOrder: c.sortOrder ?? 0,
              })
              .returning();
            if (c.id) colorKeyToDbId.set(c.id, newColor.id);
            colorKeyToDbId.set(c.name.toLowerCase().trim(), newColor.id);
          }
        }

        // Delete removed colors
        for (const removed of removedColors) {
          await tx.delete(productColors).where(eq(productColors.id, removed.id));
        }
      } else {
        for (const c of existing.colors) {
          colorKeyToDbId.set(c.id, c.id);
          colorKeyToDbId.set(c.name.toLowerCase().trim(), c.id);
        }
      }

      // 4c. Reconcile variants if provided
      if (input.variants !== undefined) {
        const incomingSkus = input.variants.map((v) => v.sku.trim());
        const skuSet = new Set(incomingSkus);
        if (skuSet.size !== incomingSkus.length) {
          throw new ValidationError(
            "Duplicate SKU detected within the submitted product variants."
          );
        }

        const existingSkuRows = await tx
          .select({
            id: productVariants.id,
            sku: productVariants.sku,
            productId: productVariants.productId,
          })
          .from(productVariants)
          .where(inArray(productVariants.sku, incomingSkus));

        for (const row of existingSkuRows) {
          if (row.productId !== input.id) {
            throw new ConflictError(
              `SKU '${row.sku}' is already in use by another product.`
            );
          }
        }

        const incomingVariantIds = new Set(
          input.variants.filter((v) => v.id).map((v) => v.id!)
        );
        const removedVariants = existing.variants.filter(
          (v) => !incomingVariantIds.has(v.id)
        );

        // Process removals
        for (const removed of removedVariants) {
          const [ordersCount] = await tx
            .select({ count: count() })
            .from(orderItems)
            .where(eq(orderItems.variantId, removed.id));

          if (Number(ordersCount?.count) > 0) {
            // Deactivate rather than delete to preserve customer order history
            await tx
              .update(productVariants)
              .set({ isActive: false, updatedAt: new Date() })
              .where(eq(productVariants.id, removed.id));
          } else {
            await tx.delete(productVariants).where(eq(productVariants.id, removed.id));
          }
        }

        // Process updates and new variants
        for (const variant of input.variants) {
          const resolvedColorId = resolveColorId(variant.colorId, variant.colorName, colorKeyToDbId);

          if (variant.id && incomingVariantIds.has(variant.id)) {
            // Update existing variant row
            await tx
              .update(productVariants)
              .set({
                colorId: resolvedColorId || null,
                sku: variant.sku.trim(),
                name: variant.name.trim(),
                size: variant.size || null,
                price: String(variant.price),
                compareAtPrice:
                  variant.compareAtPrice != null
                    ? String(variant.compareAtPrice)
                    : null,
                isActive: variant.isActive ?? true,
                attributes: variant.attributes ?? {},
                updatedAt: new Date(),
              })
              .where(eq(productVariants.id, variant.id));

            // Adjust inventory
            const [currentInv] = await tx
              .select()
              .from(inventory)
              .where(eq(inventory.variantId, variant.id))
              .limit(1);

            if (currentInv) {
              const newStock =
                variant.stock != null
                  ? Math.max(0, variant.stock)
                  : currentInv.quantityOnHand;
              const newReorder =
                variant.reorderLevel != null
                  ? Math.max(0, variant.reorderLevel)
                  : currentInv.reorderLevel;
              const stockDiff = newStock - currentInv.quantityOnHand;

              if (stockDiff !== 0 || newReorder !== currentInv.reorderLevel) {
                await tx
                  .update(inventory)
                  .set({
                    quantityOnHand: newStock,
                    reorderLevel: newReorder,
                    updatedAt: new Date(),
                  })
                  .where(eq(inventory.id, currentInv.id));

                if (stockDiff !== 0) {
                  await tx.insert(inventoryMovements).values({
                    variantId: variant.id,
                    change: stockDiff,
                    reason: "adjustment",
                    createdBy: admin.id,
                  });
                }
              }
            } else {
              const initialStock = Math.max(0, variant.stock ?? 0);
              await tx.insert(inventory).values({
                variantId: variant.id,
                quantityOnHand: initialStock,
                quantityReserved: 0,
                reorderLevel: Math.max(0, variant.reorderLevel ?? 5),
              });
              if (initialStock > 0) {
                await tx.insert(inventoryMovements).values({
                  variantId: variant.id,
                  change: initialStock,
                  reason: "restock",
                  createdBy: admin.id,
                });
              }
            }
          } else {
            // Insert brand new variant
            const [insertedVariant] = await tx
              .insert(productVariants)
              .values({
                productId: input.id,
                colorId: resolvedColorId || null,
                sku: variant.sku.trim(),
                name: variant.name.trim(),
                size: variant.size || null,
                price: String(variant.price),
                compareAtPrice:
                  variant.compareAtPrice != null
                    ? String(variant.compareAtPrice)
                    : null,
                isActive: variant.isActive ?? true,
                attributes: variant.attributes ?? {},
              })
              .returning();

            const initialStock = Math.max(0, variant.stock ?? 0);
            await tx.insert(inventory).values({
              variantId: insertedVariant.id,
              quantityOnHand: initialStock,
              quantityReserved: 0,
              reorderLevel: Math.max(0, variant.reorderLevel ?? 5),
            });

            if (initialStock > 0) {
              await tx.insert(inventoryMovements).values({
                variantId: insertedVariant.id,
                change: initialStock,
                reason: "restock",
                createdBy: admin.id,
              });
            }
          }
        }
      }

      // 4d. Reconcile images if provided
      if (input.images !== undefined) {
        const incomingImageIds = new Set(
          input.images.filter((img) => img.id).map((img) => img.id!)
        );
        const removedImages = existing.images.filter(
          (img) => !incomingImageIds.has(img.id)
        );

        for (const rem of removedImages) {
          if (rem.imagekitFileId) {
            imageFilesToPurge.push(rem.imagekitFileId);
          }
        }

        if (removedImages.length > 0) {
          const removedIds = removedImages.map((img) => img.id);
          await tx.delete(productImages).where(inArray(productImages.id, removedIds));
        }

        for (const img of input.images) {
          const resolvedImgColorId = resolveColorId(img.colorId, img.colorName, colorKeyToDbId);

          if (img.id && incomingImageIds.has(img.id)) {
            await tx
              .update(productImages)
              .set({
                colorId: resolvedImgColorId || null,
                altText: img.altText || null,
                sortOrder: img.sortOrder ?? 0,
              })
              .where(eq(productImages.id, img.id));
          } else {
            await tx.insert(productImages).values({
              productId: input.id,
              colorId: resolvedImgColorId || null,
              imagekitFileId: img.imagekitFileId || null,
              url: img.url,
              thumbnailUrl: img.thumbnailUrl || null,
              altText: img.altText || null,
              sortOrder: img.sortOrder ?? 0,
            });

            // Mark media_uploads row as attached (ECOM-008)
            if (img.imagekitFileId) {
              await tx
                .update(mediaUploads)
                .set({
                  attachedAt: new Date(),
                  productId: input.id,
                })
                .where(eq(mediaUploads.imagekitFileId, img.imagekitFileId));
            }
          }
        }
      }
    });

    // 5. Clean up removed ImageKit assets after transaction commits
    for (const fileId of imageFilesToPurge) {
      await safeDeleteImageKitFile(fileId);
    }

    const updated = await this.productRepo.findById(input.id);
    return updated!;
  }

  /**
   * Soft-deletes / archives a product.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async archiveProduct(id: string, admin: AdminContext) {
    assertRole(admin, ["admin"]);

    const existing = await this.productRepo.findById(id);
    if (!existing) {
      throw new NotFoundError("Product", id);
    }

    const archived = await this.productRepo.softDelete(id);
    return {
      success: true,
      archivedId: id,
      archivedAt: archived.deletedAt,
    };
  }

  /**
   * Permanently deletes a product and cleans up associated ImageKit assets.
   * Prohibited if customer orders reference any of its variants.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async deleteProduct(id: string, admin: AdminContext) {
    assertRole(admin, ["admin"]);

    const existing = await this.productRepo.findById(id);
    if (!existing) {
      throw new NotFoundError("Product", id);
    }

    // Check if customer orders reference any variants of this product
    const variantIds = existing.variants.map((v) => v.id);
    if (variantIds.length > 0) {
      const [ordersCount] = await db
        .select({ count: count() })
        .from(orderItems)
        .where(inArray(orderItems.variantId, variantIds));

      if (Number(ordersCount?.count) > 0) {
        throw new ConflictError(
          `Cannot permanently delete product '${existing.name}'. Customers have placed orders for its variants. Please archive the product instead.`
        );
      }
    }

    // Collect all image file IDs for post-delete purge
    const fileIds = existing.images
      .map((img) => img.imagekitFileId)
      .filter(Boolean);

    await this.productRepo.permanentDelete(id);

    // Purge assets from ImageKit after DB delete completes
    for (const fileId of fileIds) {
      await safeDeleteImageKitFile(fileId);
    }

    return {
      success: true,
      deletedId: id,
      purgedImagesCount: fileIds.length,
    };
  }

  /**
   * Detaches and permanently deletes a specific product image record,
   * then purges the asset from ImageKit post-commit.
   * Strictly verifies that imageId belongs to productId.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async detachImage(input: { productId: string; imageId: string }, admin: AdminContext) {
    assertRole(admin, ["admin"]);

    const product = await this.productRepo.findById(input.productId);
    if (!product) {
      throw new NotFoundError("Product", input.productId);
    }

    let fileIdToPurge: string | null = null;

    await db.transaction(async (tx) => {
      const [existingImage] = await tx
        .select()
        .from(productImages)
        .where(
          and(
            eq(productImages.id, input.imageId),
            eq(productImages.productId, input.productId)
          )
        );

      if (!existingImage) {
        throw new NotFoundError("ProductImage", input.imageId);
      }

      fileIdToPurge = existingImage.imagekitFileId;

      await tx
        .delete(productImages)
        .where(
          and(
            eq(productImages.id, input.imageId),
            eq(productImages.productId, input.productId)
          )
        );
    });

    // Purge asset from ImageKit strictly after DB transaction commits
    if (fileIdToPurge) {
      await safeDeleteImageKitFile(fileIdToPurge);
    }

    return {
      success: true,
      productId: input.productId,
      imageId: input.imageId,
    };
  }
}

export const productService = new ProductService();
