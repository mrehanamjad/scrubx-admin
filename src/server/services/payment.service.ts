import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { payments, type Payment } from "../../db/schema/index.ts";
import {
  paymentRepository,
  PaymentRepository,
  type PaymentListItem,
  type PaymentDetail,
} from "../repositories/payment.repository.ts";
import { orderRepository, OrderRepository } from "../repositories/order.repository.ts";
import {
  paymentMethodRepository,
  PaymentMethodRepository,
} from "../repositories/payment-method.repository.ts";
import { inventoryService, InventoryService } from "./inventory.service.ts";
import { couponService as defaultCouponService, CouponService } from "./coupon.service.ts";
import { orderService as defaultOrderService, OrderService } from "./order.service.ts";
import { assertRole, type AdminContext } from "../auth.ts";
import { NotFoundError, ValidationError, ConflictError } from "../errors.ts";
import type {
  PaymentFilterInput,
  SubmitPaymentProofInput,
  VerifyPaymentInput,
  RefundPaymentInput,
} from "../validation/payments.ts";
import type { PaginatedResult } from "../types.ts";
import type { OrderStatus } from "../validation/orders.ts";

export class PaymentService {
  private readonly paymentRepo: PaymentRepository;
  private readonly orderRepo: OrderRepository;
  private readonly invService: InventoryService;
  private readonly paymentMethodRepo: PaymentMethodRepository;
  private readonly couponService: CouponService;
  private readonly orderService: OrderService;

  constructor(
    paymentRepo: PaymentRepository = paymentRepository,
    orderRepo: OrderRepository = orderRepository,
    invService: InventoryService = inventoryService,
    paymentMethodRepo: PaymentMethodRepository = paymentMethodRepository,
    couponService: CouponService = defaultCouponService,
    orderService: OrderService = defaultOrderService
  ) {
    this.paymentRepo = paymentRepo;
    this.orderRepo = orderRepo;
    this.invService = invService;
    this.paymentMethodRepo = paymentMethodRepo;
    this.couponService = couponService;
    this.orderService = orderService;
  }

  /**
   * Retrieves paginated payment records matching filters.
   * Requires at least staff role.
   */
  async getPayments(
    filter: PaymentFilterInput,
    admin: AdminContext
  ): Promise<PaginatedResult<PaymentListItem>> {
    assertRole(admin, ["staff"]);
    return this.paymentRepo.findPaginated(filter);
  }

  /**
   * Retrieves single deep payment record with order overview and verification info.
   * Requires at least staff role.
   */
  async getPaymentById(id: string, admin: AdminContext): Promise<PaymentDetail> {
    assertRole(admin, ["staff"]);
    const payment = await this.paymentRepo.findById(id);
    if (!payment) {
      throw new NotFoundError("Payment", id);
    }
    return payment;
  }

  /**
   * Retrieves count of pending payment verifications for dashboard badge.
   * Requires at least staff role.
   */
  async getPendingCount(admin: AdminContext): Promise<number> {
    assertRole(admin, ["staff"]);
    return this.paymentRepo.getPendingCount();
  }

  /**
   * Submits payment screenshot proof and TID, moving payment to awaiting_verification.
   * Enforces source-state allowlist and order validation (BUG-008, SEC-014).
   */
  async submitPaymentProof(
    input: SubmitPaymentProofInput,
    admin?: AdminContext
  ): Promise<Payment> {
    const existing = await this.paymentRepo.findById(input.paymentId);
    if (!existing) {
      throw new NotFoundError("Payment", input.paymentId);
    }

    return db.transaction(async (tx) => {
      // 1. Lock Order First (enforcing uniform lock ordering: 1. orders -> 2. payments)
      const order = await this.orderRepo.findForUpdate(existing.orderId, tx);
      if (!order) {
        throw new NotFoundError("Order", existing.orderId);
      }

      // 2. Lock Payment Second
      const payment = await this.paymentRepo.findForUpdate(input.paymentId, tx);
      if (!payment) {
        throw new NotFoundError("Payment", input.paymentId);
      }

      // BUG-008: Source-state allowlist guard
      const SUBMITTABLE = new Set(["pending", "rejected", "awaiting_verification"]);
      if (!SUBMITTABLE.has(payment.status)) {
        throw new ValidationError(
          `Payment with status '${payment.status}' cannot accept a new proof.`
        );
      }

      // BUG-008: Order state validation
      const ACCEPTABLE_ORDER_STATUSES = new Set(["awaiting_payment", "payment_submitted", "pending"]);
      if (!ACCEPTABLE_ORDER_STATUSES.has(order.status)) {
        throw new ValidationError("This order can no longer accept payment proof.");
      }

      if (payment.orderId !== order.id) {
        throw new ValidationError("Payment does not belong to the specified order.");
      }

      // DB-013: Soft duplicate transaction reference detector
      const normalizedTxnRef = input.transactionReference ? input.transactionReference.trim().toUpperCase() : null;
      let duplicateReference: { paymentId: string; orderId: string } | null = null;

      if (normalizedTxnRef) {
        const [duplicate] = await tx
          .select({ id: payments.id, orderId: payments.orderId })
          .from(payments)
          .where(
            and(
              eq(payments.paymentMethodId, payment.paymentMethodId),
              sql`upper(trim(${payments.transactionReference})) = ${normalizedTxnRef}`,
              ne(payments.id, payment.id),
              ne(payments.status, "rejected")
            )
          )
          .limit(1);

        if (duplicate) {
          duplicateReference = { paymentId: duplicate.id, orderId: duplicate.orderId };
        }
      }

      const existingMetadata = (payment.metadata as Record<string, any>) || {};
      const updatedMetadata = {
        ...existingMetadata,
        imagekitFileId: input.imagekitFileId || existingMetadata.imagekitFileId,
        proofUploadedAt: new Date().toISOString(),
        customerNotes: input.customerNotes || existingMetadata.customerNotes,
        submittedBy: admin?.id || "customer",
        ...(duplicateReference ? { duplicateReference } : {}),
      };

      const updatedPayment = await this.paymentRepo.update(
        payment.id,
        {
          status: "awaiting_verification",
          senderName: input.senderName || payment.senderName,
          senderAccountLast4: input.senderAccountLast4 || payment.senderAccountLast4,
          transactionReference: input.transactionReference ? input.transactionReference.trim().toUpperCase() : payment.transactionReference,
          proofUrl: input.proofUrl || payment.proofUrl,
          verifiedBy: null,
          verifiedAt: null,
          rejectionReason: null,
          metadata: updatedMetadata,
        },
        tx
      );

      // Advance order from awaiting_payment to payment_submitted
      if (order.status === "awaiting_payment") {
        await this.orderRepo.updateOrderStatus(
          order.id,
          "payment_submitted",
          "awaiting_payment",
          `Payment proof submitted (TID: ${input.transactionReference || "N/A"}).`,
          admin?.id || "system",
          tx
        );
      }

      return updatedPayment!;
    });
  }

  /**
   * Approves payment proof, advances order status to confirmed, and idempotently commits stock sale.
   * Strictly requires administrator (admin or super_admin) role (BUG-009).
   */
  async approvePayment(
    input: VerifyPaymentInput,
    admin: AdminContext
  ): Promise<Payment> {
    assertRole(admin, ["admin"]);

    const targetPayment = await this.paymentRepo.findById(input.paymentId);
    if (!targetPayment) {
      throw new NotFoundError("Payment", input.paymentId);
    }

    return db.transaction(async (tx) => {
      // 1. Lock Order First (enforcing global lock order: 1. orders -> 2. payments -> 3. inventory)
      const order = await this.orderRepo.findForUpdate(targetPayment.orderId, tx);
      if (!order) {
        throw new NotFoundError("Order", targetPayment.orderId);
      }

      // 2. Lock Payment Second
      const payment = await this.paymentRepo.findForUpdate(input.paymentId, tx);
      if (!payment) {
        throw new NotFoundError("Payment", input.paymentId);
      }

      // Idempotency: if already paid, return without duplicating side-effects
      if (payment.status === "paid") {
        return payment;
      }

      // BUG-009: Reject terminal payment states
      if (["refunded", "failed"].includes(payment.status)) {
        throw new ValidationError(`Cannot approve a payment with status '${payment.status}'.`);
      }

      // BUG-009: Reject cancelled or refunded orders
      if (["cancelled", "refunded"].includes(order.status)) {
        throw new ValidationError(
          `Order ${order.orderNumber} is ${order.status} and cannot accept payment approval.`
        );
      }

      // ECOM-006: Guard against duplicate transaction references
      const meta = (payment.metadata as any) || {};
      if (meta.duplicateReference && !input.allowDuplicateOverride) {
        throw new ConflictError(
          `Transaction reference "${payment.transactionReference || ""}" is already attached to another payment. Super admin override required.`
        );
      }
      if (meta.duplicateReference && input.allowDuplicateOverride) {
        assertRole(admin, ["super_admin"]);
      }

      const now = new Date();
      const updatedPayment = await this.paymentRepo.update(
        payment.id,
        {
          status: "paid",
          verifiedBy: admin.id,
          verifiedAt: now,
          paidAt: now,
          rejectionReason: null,
        },
        tx
      );

      // 3. Advance Order to Confirmed
      if (["awaiting_payment", "payment_submitted", "pending"].includes(order.status)) {
        await this.orderRepo.updateOrderStatus(
          order.id,
          "confirmed",
          order.status as OrderStatus,
          `Payment of PKR ${payment.amount} verified and approved.`,
          admin.id,
          tx
        );

        // 4. Idempotently commit inventory reservation (locks inventory third)
        const orderBundle = await this.orderRepo.findById(order.id, tx);
        if (orderBundle?.items) {
          for (const item of orderBundle.items) {
            if (item.variantId) {
              await this.invService.commitOrderSale(
                item.variantId,
                item.quantity,
                order.id,
                admin.id,
                tx
              );
            }
          }
        }
      } else {
        // Instalment approval on already confirmed/processing order: audit in history
        await this.orderRepo.addNote(
          {
            orderId: order.id,
            body: `Additional payment of PKR ${payment.amount} verified and approved.`,
            createdBy: admin.id,
          },
          tx
        );
      }

      return updatedPayment!;
    });
  }

  /**
   * Rejects payment proof, reverts order to awaiting_payment, and retains audit history.
   * Strictly requires administrator (admin or super_admin) role.
   */
  async rejectPayment(
    input: VerifyPaymentInput,
    admin: AdminContext
  ): Promise<Payment> {
    assertRole(admin, ["admin"]);

    const targetPayment = await this.paymentRepo.findById(input.paymentId);
    if (!targetPayment) {
      throw new NotFoundError("Payment", input.paymentId);
    }

    return db.transaction(async (tx) => {
      // 1. Lock Order First (uniform lock order: 1. orders -> 2. payments)
      const order = await this.orderRepo.findForUpdate(targetPayment.orderId, tx);
      if (!order) {
        throw new NotFoundError("Order", targetPayment.orderId);
      }

      // 2. Lock Payment Second
      const payment = await this.paymentRepo.findForUpdate(input.paymentId, tx);
      if (!payment) {
        throw new NotFoundError("Payment", input.paymentId);
      }

      const now = new Date();
      const reasonText = input.rejectionReason || "Payment proof could not be verified.";

      const existingMetadata = payment.metadata || {};
      const rejectionHistory = [
        ...(existingMetadata.rejectionHistory || []),
        {
          rejectedBy: admin.id,
          rejectedAt: now.toISOString(),
          reason: reasonText,
        },
      ];

      const updatedPayment = await this.paymentRepo.update(
        payment.id,
        {
          status: "rejected",
          verifiedBy: admin.id,
          verifiedAt: now,
          rejectionReason: reasonText,
          metadata: {
            ...existingMetadata,
            rejectionHistory,
          },
        },
        tx
      );

      // Revert order status to awaiting_payment so customer can retry
      if (order.status === "payment_submitted") {
        await this.orderRepo.updateOrderStatus(
          order.id,
          "awaiting_payment",
          "payment_submitted",
          `Payment proof rejected: ${reasonText}`,
          admin.id,
          tx
        );
      }

      return updatedPayment!;
    });
  }

  /**
   * Records a processed monetary refund.
   * Strictly requires administrator (admin or super_admin) role (BUG-010).
   */
  async refundPayment(
    input: RefundPaymentInput,
    admin: AdminContext
  ): Promise<Payment> {
    assertRole(admin, ["admin"]);

    const targetPayment = await this.paymentRepo.findById(input.paymentId);
    if (!targetPayment) {
      throw new NotFoundError("Payment", input.paymentId);
    }

    return db.transaction(async (tx) => {
      // 1. Lock Order First (uniform lock order: 1. orders -> 2. payments -> 3. inventory)
      const order = await this.orderRepo.findForUpdate(targetPayment.orderId, tx);
      if (!order) {
        throw new NotFoundError("Order", targetPayment.orderId);
      }

      // 2. Lock Payment Second
      const payment = await this.paymentRepo.findForUpdate(input.paymentId, tx);
      if (!payment) {
        throw new NotFoundError("Payment", input.paymentId);
      }

      if (payment.status !== "paid") {
        throw new ValidationError(
          `Cannot refund payment with status '${payment.status}'. Only paid payments can be refunded.`
        );
      }

      const refundAmountNum = Number(input.refundAmount);
      if (isNaN(refundAmountNum) || refundAmountNum <= 0) {
        throw new ValidationError("Refund amount must be a positive number.");
      }

      const currentRefundAmount = Number(payment.refundAmount || 0);
      const paymentAmount = Number(payment.amount);
      const maxRefundable = paymentAmount - currentRefundAmount;

      if (refundAmountNum > maxRefundable + 0.0001) {
        throw new ValidationError(
          `Refund amount PKR ${refundAmountNum} exceeds remaining refundable balance PKR ${maxRefundable.toFixed(2)}.`
        );
      }

      const totalRefundedOnPayment = currentRefundAmount + refundAmountNum;
      const isPaymentFullyRefunded = totalRefundedOnPayment >= paymentAmount - 0.0001;
      const now = new Date();

      const existingMetadata = payment.metadata || {};
      const refundsHistory = [
        ...(existingMetadata.refunds || []),
        {
          amount: refundAmountNum,
          reason: input.reason,
          refundedBy: admin.id,
          refundedAt: now.toISOString(),
        },
      ];

      const updatedPayment = await this.paymentRepo.update(
        payment.id,
        {
          status: isPaymentFullyRefunded ? "refunded" : "paid",
          refundAmount: totalRefundedOnPayment.toFixed(2),
          refundedAt: now,
          refundedBy: admin.id,
          metadata: {
            ...existingMetadata,
            refunds: refundsHistory,
          },
        },
        tx
      );

      // Check sum of refunds across all payments on this order
      const allPayments = await this.paymentRepo.findByOrderId(order.id, tx);
      const totalRefundedOnOrder = allPayments.reduce((sum, p) => {
        if (p.id === payment.id) {
          return sum + totalRefundedOnPayment;
        }
        return sum + Number(p.refundAmount || (p.status === "refunded" ? p.amount : 0));
      }, 0);

      const orderTotal = Number(order.total);
      const isOrderFullyRefunded = totalRefundedOnOrder >= orderTotal - 0.0001;

      if (isOrderFullyRefunded) {
        // Full refund path
        if (["confirmed", "processing"].includes(order.status)) {
          // Pre-shipment refund: cancel order through service FSM (restores stock & releases coupons)
          await this.orderService.updateOrderStatus(
            {
              orderId: order.id,
              status: "cancelled",
              note: `Full refund of PKR ${totalRefundedOnOrder.toFixed(2)} issued: ${input.reason}`,
            },
            admin,
            tx
          );
        } else if (["shipped", "delivered"].includes(order.status)) {
          // Terminal refund through service FSM
          await this.orderService.updateOrderStatus(
            {
              orderId: order.id,
              status: "refunded",
              note: `Full refund of PKR ${totalRefundedOnOrder.toFixed(2)} issued: ${input.reason}`,
            },
            admin,
            tx
          );
          // Release coupons
          await this.couponService.releaseOrderRedemption(order.id, tx, "order_refunded");

          // If explicit restock requested for returned goods
          if (input.restock) {
            const orderDetails = await this.orderRepo.findById(order.id, tx);
            if (orderDetails?.items) {
              for (const item of orderDetails.items) {
                if (item.variantId) {
                  await this.invService.cancelOrderStock(
                    item.variantId,
                    item.quantity,
                    order.id,
                    true,
                    admin.id,
                    tx
                  );
                }
              }
            }
          }
        } else {
          // Order already cancelled or refunded: record note in history
          await this.orderRepo.addNote(
            {
              orderId: order.id,
              body: `Full payment refund of PKR ${refundAmountNum.toFixed(2)} recorded. Reason: ${input.reason}`,
              createdBy: admin.id,
            },
            tx
          );
        }
      } else {
        // Partial refund path: do NOT flip order status; record note in order notes/history
        await this.orderRepo.addNote(
          {
            orderId: order.id,
            body: `Partial payment refund of PKR ${refundAmountNum.toFixed(2)} recorded. Reason: ${input.reason}`,
            createdBy: admin.id,
          },
          tx
        );
      }

      return updatedPayment!;
    });
  }

  /**
   * Directly marks payment for an order as paid (for COD cash collections, manual bank transfers).
   * Creates a payment row if none exists yet, updates status to 'paid', locks order, and commits sale.
   */
  async markOrderPaymentPaid(
    orderId: string,
    details: { paymentId?: string; transactionReference?: string; note?: string } = {},
    admin: AdminContext
  ): Promise<Payment> {
    assertRole(admin, ["admin"]);

    return db.transaction(async (tx) => {
      // 1. Lock Order First (enforcing uniform lock order: 1. orders -> 2. payments -> 3. inventory)
      const order = await this.orderRepo.findForUpdate(orderId, tx);
      if (!order) {
        throw new NotFoundError("Order", orderId);
      }

      const now = new Date();
      let payment: Payment | null = null;

      if (details.paymentId) {
        payment = await this.paymentRepo.findForUpdate(details.paymentId, tx);
      } else {
        const orderPayments = await this.paymentRepo.findByOrderId(orderId, tx);
        if (orderPayments.length > 0) {
          payment = await this.paymentRepo.findForUpdate(orderPayments[0].id, tx);
        }
      }

      let updatedPayment: Payment;

      if (payment) {
        if (payment.status === "paid") {
          return payment;
        }
        updatedPayment = (await this.paymentRepo.update(
          payment.id,
          {
            status: "paid",
            verifiedBy: admin.id,
            verifiedAt: now,
            paidAt: now,
            transactionReference: details.transactionReference || payment.transactionReference,
            rejectionReason: null,
          },
          tx
        ))!;
      } else {
        // Create new paid payment record (e.g. COD order upon delivery)
        let paymentMethodId = order.paymentMethodId;
        if (!paymentMethodId) {
          const defaultMethod =
            (await this.paymentMethodRepo.findByCode("cod", tx)) ||
            (await this.paymentMethodRepo.findAll(tx))[0];
          if (!defaultMethod) {
            throw new ValidationError(
              "No payment method available to associate with this payment."
            );
          }
          paymentMethodId = defaultMethod.id;
        }

        updatedPayment = await this.paymentRepo.create(
          {
            orderId: order.id,
            paymentMethodId,
            status: "paid",
            amount: order.total,
            currency: order.currency || "PKR",
            transactionReference: details.transactionReference || null,
            verifiedBy: admin.id,
            verifiedAt: now,
            paidAt: now,
            metadata: {},
          },
          tx
        );
      }

      // 2. Advance Order to Confirmed if still in initial payment stages
      if (["awaiting_payment", "payment_submitted", "pending"].includes(order.status)) {
        await this.orderRepo.updateOrderStatus(
          order.id,
          "confirmed",
          order.status as OrderStatus,
          details.note || `Payment of PKR ${order.total} marked as paid.`,
          admin.id,
          tx
        );

        // Commit stock reservation into committed sale
        const orderDetails = await this.orderRepo.findById(order.id, tx);
        if (orderDetails?.items) {
          for (const item of orderDetails.items) {
            if (item.variantId) {
              await this.invService.commitOrderSale(
                item.variantId,
                item.quantity,
                order.id,
                admin.id,
                tx
              );
            }
          }
        }
      }

      return updatedPayment;
    });
  }

  /**
   * Resets an order's payment status to pending / unpaid.
   * Fully reverses stock commitment if order was confirmed/processing, and reverts order to awaiting_payment.
   * Strictly requires administrator (admin or super_admin) role (BUG-011).
   */
  async markOrderPaymentPending(
    orderId: string,
    details: { paymentId?: string; note?: string } = {},
    admin: AdminContext
  ): Promise<Payment | null> {
    assertRole(admin, ["admin"]);

    return db.transaction(async (tx) => {
      // 1. Lock Order First (uniform lock order: 1. orders -> 2. payments -> 3. inventory)
      const order = await this.orderRepo.findForUpdate(orderId, tx);
      if (!order) throw new NotFoundError("Order", orderId);

      // Guards
      if (["cancelled", "refunded"].includes(order.status)) {
        throw new ValidationError(`Cannot mark payment as pending on a ${order.status} order.`);
      }
      if (["shipped", "delivered"].includes(order.status)) {
        throw new ValidationError("Delivered or shipped orders cannot be marked unpaid; use a refund.");
      }

      let payment: Payment | null = null;
      if (details.paymentId) {
        payment = await this.paymentRepo.findForUpdate(details.paymentId, tx);
      } else {
        // Deterministically pick the latest payment
        const orderPayments = await this.paymentRepo.findByOrderId(orderId, tx);
        if (orderPayments.length > 0) {
          const sorted = [...orderPayments].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          payment = await this.paymentRepo.findForUpdate(sorted[0].id, tx);
        }
      }

      if (!payment) {
        return null;
      }

      if (payment.status === "refunded") {
        throw new ValidationError("Cannot mark a refunded payment as pending.");
      }
      if (payment.status === "pending") {
        return payment;
      }

      const noteText = details.note || "Payment marked as unpaid (administrative correction).";
      const now = new Date();

      // If order is confirmed or processing, reverse stock commitment and return order to awaiting_payment
      if (["confirmed", "processing"].includes(order.status)) {
        const orderDetails = await this.orderRepo.findById(order.id, tx);
        if (orderDetails?.items) {
          for (const item of orderDetails.items) {
            if (item.variantId) {
              await this.invService.cancelOrderStock(
                item.variantId,
                item.quantity,
                order.id,
                true,
                admin.id,
                tx
              );
            }
          }
        }

        // Transition order back to awaiting_payment
        await this.orderService.updateOrderStatus(
          {
            orderId: order.id,
            status: "awaiting_payment",
            note: noteText,
          },
          admin,
          tx
        );
      }

      const existingMetadata = payment.metadata || {};
      const correctionsHistory = [
        ...(existingMetadata.corrections || []),
        {
          by: admin.id,
          at: now.toISOString(),
          from: payment.status,
          to: "pending",
          note: noteText,
        },
      ];

      const updatedPayment = await this.paymentRepo.update(
        payment.id,
        {
          status: "pending",
          paidAt: null,
          verifiedAt: null,
          verifiedBy: null,
          metadata: {
            ...existingMetadata,
            corrections: correctionsHistory,
          },
        },
        tx
      );

      return updatedPayment!;
    });
  }
}

export const paymentService = new PaymentService();
