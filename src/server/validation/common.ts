import { z } from "zod";

/**
 * UUID Validation Schema (v4 / v7 / generic RFC 4122)
 */
export const uuidSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid UUID identifier format."
  );

/**
 * URL-Safe Slug Validation Schema (e.g., 'womens-scrub-top')
 */
export const slugSchema = z
  .string()
  .trim()
  .min(2, "Slug must be at least 2 characters long.")
  .max(120, "Slug cannot exceed 120 characters.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must contain only lowercase alphanumeric characters separated by single hyphens."
  );

/**
 * Monetary PKR Price Schema (Non-negative decimal with max 2 fractional digits)
 */
export const pricePkrSchema = z.coerce
  .number({ message: "Price must be a valid number." })
  .min(0, "Price cannot be negative.")
  .max(10_000_000, "Price exceeds maximum supported transaction threshold.")
  .refine(
    (val) => Number(val.toFixed(2)) === val,
    "Price cannot have more than 2 decimal places."
  );

/**
 * Inventory & Quantity Schema (Non-negative whole integer)
 */
export const quantitySchema = z.coerce
  .number({ message: "Quantity must be a valid integer." })
  .int("Quantity must be a whole number.")
  .min(0, "Quantity cannot be negative.");

/**
 * Percentage Schema (0 to 100 for discounts/taxes)
 */
export const percentageSchema = z.coerce
  .number({ message: "Percentage must be a number." })
  .min(0, "Percentage cannot be less than 0%.")
  .max(100, "Percentage cannot exceed 100%.");

/**
 * Standard Pagination Schema
 */
export const paginationSchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1, "Page number must be at least 1.")
    .default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, "Limit must be at least 1.")
    .max(100, "Limit cannot exceed 100 items per page.")
    .default(20),
  sortBy: z.string().trim().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

/**
 * Search Query Parameters Schema
 */
export const searchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(100, "Search query is too long (maximum 100 characters).")
    .optional(),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;

/**
 * Date Range Filter Schema with chronological invariant check
 */
export const dateRangeSchema = z
  .object({
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
  })
  .refine(
    (data) => {
      if (!data.from || !data.to) return true;
      const fromDate = new Date(data.from);
      const toDate = new Date(data.to);
      return !isNaN(fromDate.getTime()) && !isNaN(toDate.getTime()) && fromDate <= toDate;
    },
    {
      message: "The 'from' date must be earlier than or equal to the 'to' date.",
      path: ["from"],
    }
  );

export type DateRangeInput = z.infer<typeof dateRangeSchema>;

/**
 * Allowed Image MIME Types (SEC-006: strictly raster formats only; SVG excluded to prevent stored XSS)
 */
export const allowedImageMimeTypesSchema = z.enum(
  [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
  ],
  {
    message: "Unsupported file MIME type. Allowed formats: JPEG, PNG, WebP, AVIF.",
  }
);

/**
 * Valid ImageKit storage destination folders
 */
export const imageFolderSchema = z.enum(
  [
    "/scrubx/products",
    "/scrubx/categories",
    "/scrubx/engraving-logos",
    "/scrubx/payment-proofs",
  ],
  {
    message: "Invalid destination storage folder.",
  }
);

/**
 * Uploaded Media Metadata Validation Schema
 */
export const fileUploadMetaSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, "File name is required.")
    .max(255, "File name cannot exceed 255 characters.")
    .regex(/^[\w.\-]+$/, "File name contains invalid characters."),
  size: z
    .number()
    .int()
    .min(1, "File size must be greater than 0 bytes.")
    .max(5 * 1024 * 1024, "File size cannot exceed the 5MB maximum limit."),
  mimeType: allowedImageMimeTypesSchema,
  folder: imageFolderSchema,
});

export type FileUploadMetaInput = z.infer<typeof fileUploadMetaSchema>;
