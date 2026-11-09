"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSafeAction } from "../server/action-client.ts";
import { paymentService } from "../server/services/payment.service.ts";
import {
  submitPaymentProofSchema,
  verifyPaymentSchema,
  refundPaymentSchema,
} from "../server/validation/payments.ts";
import { uuidSchema } from "../server/validation/common.ts";

/**
 * Server Action: Submit screenshot proof and transaction reference.
 * Requires at least staff privileges.
 */
export const submitPaymentProofAction = createSafeAction(
  {
    schema: submitPaymentProofSchema,
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    const updated = await paymentService.submitPaymentProof(input, admin);
    revalidatePath("/payments");
    revalidatePath("/orders");
    return updated;
  }
);

/**
 * Server Action: Approve payment proof, advance order status, and commit stock sale.
 * Strictly requires administrator privileges.
 */
export const approvePaymentAction = createSafeAction(
  {
    schema: verifyPaymentSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const payment = await paymentService.approvePayment(input, admin);
    revalidatePath("/payments");
    revalidatePath("/orders");
    revalidatePath("/inventory");
    return payment;
  }
);

/**
 * Server Action: Reject payment proof, revert order status, and retain audit history.
 * Strictly requires administrator privileges.
 */
export const rejectPaymentAction = createSafeAction(
  {
    schema: verifyPaymentSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const payment = await paymentService.rejectPayment(input, admin);
    revalidatePath("/payments");
    revalidatePath("/orders");
    return payment;
  }
);

/**
 * Server Action: Record processed monetary refund.
 * Strictly requires administrator privileges.
 */
export const refundPaymentAction = createSafeAction(
  {
    schema: refundPaymentSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const payment = await paymentService.refundPayment(input, admin);
    revalidatePath("/payments");
    revalidatePath("/orders");
    return payment;
  }
);

/**
 * Server Action: Directly mark order payment as paid (for COD cash collections, manual bank transfers).
 * Strictly requires administrator privileges.
 */
export const markOrderPaymentPaidAction = createSafeAction(
  {
    schema: z.object({
      orderId: uuidSchema,
      paymentId: uuidSchema.optional().nullable(),
      transactionReference: z.string().trim().max(100).optional().nullable(),
      note: z.string().trim().max(500).optional().nullable(),
    }),
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const payment = await paymentService.markOrderPaymentPaid(
      input.orderId,
      {
        paymentId: input.paymentId || undefined,
        transactionReference: input.transactionReference || undefined,
        note: input.note || undefined,
      },
      admin
    );
    revalidatePath("/payments");
    revalidatePath("/orders");
    revalidatePath(`/orders/${input.orderId}`);
    return payment;
  }
);

/**
 * Server Action: Reset order payment status to pending / unpaid.
 * Strictly requires administrator privileges.
 */
export const markOrderPaymentPendingAction = createSafeAction(
  {
    schema: z.object({
      orderId: uuidSchema,
      paymentId: uuidSchema.optional().nullable(),
      note: z.string().trim().max(500).optional().nullable(),
    }),
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const payment = await paymentService.markOrderPaymentPending(
      input.orderId,
      {
        paymentId: input.paymentId || undefined,
        note: input.note || undefined,
      },
      admin
    );
    revalidatePath("/payments");
    revalidatePath("/orders");
    revalidatePath(`/orders/${input.orderId}`);
    return payment;
  }
);
