"use server";

import { revalidatePath } from "next/cache";
import { createSafeAction } from "../server/action-client.ts";
import { productService } from "../server/services/product.service.ts";
import {
  productFilterSchema,
  getProductByIdSchema,
  createProductSchema,
  updateProductSchema,
  archiveProductSchema,
  deleteProductSchema,
  detachProductImageSchema,
} from "../server/validation/catalog.ts";

/**
 * Server Action: Paginated catalog query with multi-faceted filtering.
 * Requires at least staff privileges.
 */
export const getProductsAction = createSafeAction(
  {
    schema: productFilterSchema.optional(),
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    return productService.getProducts(input ?? {}, admin);
  }
);

/**
 * Server Action: Retrieve full product bundle by ID.
 * Requires at least staff privileges.
 */
export const getProductByIdAction = createSafeAction(
  {
    schema: getProductByIdSchema,
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    return productService.getProductById(input.id, admin);
  }
);

/**
 * Server Action: Create a new product with colors, variants, stock, and images.
 * Strictly requires administrator (admin or super_admin) privileges.
 */
export const createProductAction = createSafeAction(
  {
    schema: createProductSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const created = await productService.createProduct(input, admin);
    revalidatePath("/products");
    revalidatePath("/categories");
    revalidatePath("/inventory");
    return created;
  }
);

/**
 * Server Action: Update an existing product and reconcile colors, variants, and images.
 * Strictly requires administrator (admin or super_admin) privileges.
 */
export const updateProductAction = createSafeAction(
  {
    schema: updateProductSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await productService.updateProduct(input, admin);
    revalidatePath("/products");
    revalidatePath("/categories");
    revalidatePath("/inventory");
    return updated;
  }
);

/**
 * Server Action: Soft-delete / archive a product.
 * Strictly requires administrator (admin or super_admin) privileges.
 */
export const archiveProductAction = createSafeAction(
  {
    schema: archiveProductSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const result = await productService.archiveProduct(input.id, admin);
    revalidatePath("/products");
    revalidatePath("/categories");
    revalidatePath("/inventory");
    return result;
  }
);

/**
 * Server Action: Permanently delete a product (if no customer orders reference its variants).
 * Strictly requires administrator (admin or super_admin) privileges.
 */
export const deleteProductAction = createSafeAction(
  {
    schema: deleteProductSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const result = await productService.deleteProduct(input.id, admin);
    revalidatePath("/products");
    revalidatePath("/categories");
    revalidatePath("/inventory");
    return result;
  }
);

/**
 * Server Action: Detach and permanently delete a product image.
 * Post-commit purges asset from ImageKit.
 * Strictly requires administrator (admin or super_admin) privileges.
 */
export const detachProductImageAction = createSafeAction(
  {
    schema: detachProductImageSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const result = await productService.detachImage(input, admin);
    revalidatePath("/products");
    revalidatePath(`/products/${input.productId}`);
    return result;
  }
);
