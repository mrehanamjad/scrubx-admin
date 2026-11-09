import { z } from "zod";
import { uuidSchema } from "./common.ts";

/**
 * Supported Order Statuses in PostgreSQL Enum
 */
export const orderStatusEnumSchema = z.enum([
  "awaiting_payment",
  "payment_submitted",
  "pending", // Cash on Delivery
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);

export type OrderStatus = z.infer<typeof orderStatusEnumSchema>;

/**
 * Item Engraving Input Schema
 */
export const orderItemEngravingInputSchema = z
  .object({
    engravingOptionId: uuidSchema,
    text: z.string().trim().max(100).optional().nullable(),
    logoUrl: z.string().trim().optional().nullable(),
    logoImagekitFileId: z.string().trim().optional().nullable(),
    placement: z.string().trim().max(100).optional().nullable(),
  })
  .refine(
    (data) =>
      (data.text && data.text.trim().length > 0) ||
      (data.logoUrl && data.logoUrl.trim().length > 0),
    {
      message: "Custom engraving must include either name text or a logo file URL.",
    }
  );

export type OrderItemEngravingInput = z.infer<typeof orderItemEngravingInputSchema>;

/**
 * Order Line Item Input Schema
 */
export const orderItemInputSchema = z.object({
  variantId: uuidSchema,
  quantity: z
    .number({ message: "Quantity must be an integer." })
    .int("Quantity must be a whole number.")
    .min(1, "Quantity must be at least 1."),
  engraving: orderItemEngravingInputSchema.optional().nullable(),
});

export type OrderItemInput = z.infer<typeof orderItemInputSchema>;

/**
 * Shipping Address Snapshot Input Schema
 */
export const shippingAddressInputSchema = z.object({
  fullName: z.string().trim().min(1, "Full recipient name is required."),
  phone: z.string().trim().min(7, "Valid contact phone is required."),
  addressLine1: z.string().trim().min(3, "Address line 1 is required."),
  addressLine2: z.string().trim().max(255).optional().nullable(),
  city: z.string().trim().min(2, "City is required."),
  province: z.string().trim().max(100).optional().nullable(),
  postalCode: z.string().trim().max(20).optional().nullable(),
  country: z.string().trim().default("PK"),
});

export type ShippingAddressInput = z.infer<typeof shippingAddressInputSchema>;

/**
 * Create Order Payload Schema
 */
export const createOrderSchema = z
  .object({
    customerId: uuidSchema.optional().nullable(),
    customer: z
      .object({
        email: z.string().trim().email("Valid customer email is required."),
        firstName: z.string().trim().max(100).optional().nullable(),
        lastName: z.string().trim().max(100).optional().nullable(),
        phone: z.string().trim().max(30).optional().nullable(),
      })
      .optional()
      .nullable(),
    shippingAddress: shippingAddressInputSchema,
    items: z.array(orderItemInputSchema).min(1, "Order must contain at least 1 item."),
    paymentMethodId: uuidSchema,
    shippingMethodId: uuidSchema.optional().nullable(),
    couponCode: z.string().trim().max(50).optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
    idempotencyKey: z.string().trim().max(255).optional().nullable(),
  })
  .refine((data) => Boolean(data.customerId || data.customer?.email), {
    message: "Either existing customerId or customer details with valid email must be provided.",
    path: ["customerId"],
  });

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/**
 * Order Query & Filter Schema
 */
export const orderFilterSchema = z.object({
  q: z.string().trim().optional(),
  status: orderStatusEnumSchema.optional(),
  paymentStatus: z
    .enum(["pending", "awaiting_verification", "paid", "rejected", "failed", "refunded"])
    .optional(),
  paymentMethodId: uuidSchema.optional(),
  customerId: uuidSchema.optional(),
  hasEngraving: z.boolean().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["placedAt", "total", "status", "orderNumber"]).default("placedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type OrderFilterInput = z.infer<typeof orderFilterSchema>;

/**
 * Update Order Status Schema
 */
export const updateOrderStatusSchema = z.object({
  orderId: uuidSchema,
  status: orderStatusEnumSchema,
  note: z.string().trim().max(500).optional().nullable(),
});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

/**
 * Bulk Order Status Update Schema (ECOM-009)
 */
export const bulkUpdateOrderStatusSchema = z.object({
  orderIds: z
    .array(uuidSchema)
    .min(1, "At least one order ID is required.")
    .max(50, "Maximum 50 orders can be updated at once."),
  status: orderStatusEnumSchema,
  note: z.string().trim().max(500).optional().nullable(),
});

export type BulkUpdateOrderStatusInput = z.infer<typeof bulkUpdateOrderStatusSchema>;

/**
 * Update Order Shipping & Courier Schema
 */
export const updateOrderShippingSchema = z.object({
  orderId: uuidSchema,
  courier: z.string().trim().max(100).optional().nullable(),
  trackingNumber: z.string().trim().max(100).optional().nullable(),
});

export type UpdateOrderShippingInput = z.infer<typeof updateOrderShippingSchema>;

/**
 * Add Internal Order Note Schema
 */
export const addOrderNoteSchema = z.object({
  orderId: uuidSchema,
  body: z.string().trim().min(1, "Order note text cannot be empty.").max(2000),
});

export type AddOrderNoteInput = z.infer<typeof addOrderNoteSchema>;

/**
 * Returns & Exchanges Schemas (ECOM-002, ECOM-003)
 */
export const requestOrderReturnSchema = z.object({
  orderId: uuidSchema,
  reason: z.string().trim().min(3, "Reason must be at least 3 characters.").max(500),
  notes: z.string().trim().max(1000).optional(),
  items: z
    .array(
      z.object({
        orderItemId: uuidSchema,
        quantity: z.number().int().positive("Return quantity must be positive."),
        restock: z.boolean().optional().default(true),
      })
    )
    .min(1, "At least one item must be selected for return."),
});

export type RequestOrderReturnInput = z.infer<typeof requestOrderReturnSchema>;

export const approveOrderReturnSchema = z.object({
  returnId: uuidSchema,
});

export type ApproveOrderReturnInput = z.infer<typeof approveOrderReturnSchema>;

export const receiveOrderReturnSchema = z.object({
  returnId: uuidSchema,
  items: z
    .array(
      z.object({
        returnItemId: uuidSchema,
        restock: z.boolean(),
      })
    )
    .optional(),
});

export type ReceiveOrderReturnInput = z.infer<typeof receiveOrderReturnSchema>;

export const completeOrderReturnSchema = z.object({
  returnId: uuidSchema,
  refundAmount: z.number().positive("Refund amount must be positive.").optional(),
});

export type CompleteOrderReturnInput = z.infer<typeof completeOrderReturnSchema>;

export const createOrderExchangeSchema = z.object({
  orderId: uuidSchema,
  reason: z.string().trim().min(3, "Exchange reason is required.").max(500),
  returnItems: z
    .array(
      z.object({
        orderItemId: uuidSchema,
        quantity: z.number().int().positive(),
      })
    )
    .min(1, "Select at least one item to exchange."),
  replacementVariantId: uuidSchema,
  replacementQuantity: z.number().int().positive().default(1),
});

export type CreateOrderExchangeInput = z.infer<typeof createOrderExchangeSchema>;

