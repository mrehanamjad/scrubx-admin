import { z } from "zod";
import { uuidSchema, pricePkrSchema } from "./common.ts";

/**
 * Payment Statuses in PostgreSQL Enum
 */
export const paymentStatusEnumSchema = z.enum([
  "pending",
  "awaiting_verification",
  "paid",
  "rejected",
  "failed",
  "refunded",
]);

export type PaymentStatus = z.infer<typeof paymentStatusEnumSchema>;

/**
 * Payment Listing Filter Schema
 */
export const paymentFilterSchema = z.object({
  orderId: uuidSchema.optional(),
  status: paymentStatusEnumSchema.optional(),
  paymentMethodId: uuidSchema.optional(),
  q: z.string().trim().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "amount", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type PaymentFilterInput = z.infer<typeof paymentFilterSchema>;

/**
 * Customer / Admin Submit Payment Proof Schema
 */
export const submitPaymentProofSchema = z.object({
  paymentId: uuidSchema,
  senderName: z.string().trim().max(100).optional().nullable(),
  senderAccountLast4: z.string().trim().max(10).optional().nullable(),
  transactionReference: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._-]{4,64}$/, "Transaction reference must be 4-64 alphanumeric characters.")
    .optional()
    .nullable(),
  proofUrl: z
    .string()
    .trim()
    .url("Invalid proof URL format.")
    .max(2048)
    .refine(
      (u) => {
        const endpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || "https://ik.imagekit.io";
        return u.startsWith(endpoint);
      },
      "Proof must be hosted on the ScrubX media CDN."
    )
    .optional()
    .nullable(),
  imagekitFileId: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid ImageKit file reference.")
    .max(128)
    .optional()
    .nullable(),
  customerNotes: z.string().trim().max(500).optional().nullable(),
});

export type SubmitPaymentProofInput = z.infer<typeof submitPaymentProofSchema>;

/**
 * Admin Verify Payment (Approve or Reject) Schema
 */
export const verifyPaymentSchema = z
  .object({
    paymentId: uuidSchema,
    action: z.enum(["approve", "reject"]),
    rejectionReason: z.string().trim().max(500).optional().nullable(),
    allowDuplicateOverride: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.action === "reject") {
        return Boolean(data.rejectionReason && data.rejectionReason.trim().length > 0);
      }
      return true;
    },
    {
      message: "A rejection reason must be provided when rejecting payment.",
      path: ["rejectionReason"],
    }
  );

export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

/**
 * Process Payment Refund Schema (BUG-010, DB-005)
 */
export const refundPaymentSchema = z.object({
  paymentId: uuidSchema,
  refundAmount: pricePkrSchema.refine((v) => Number(v) > 0, "Refund amount must be positive."),
  reason: z.string().trim().min(3, "Refund reason is required.").max(500),
  restock: z.boolean().optional().default(false),
});

export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;
