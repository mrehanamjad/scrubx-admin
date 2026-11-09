import { and, desc, asc, eq, sql, ilike, or, gte, lte } from "drizzle-orm";
import { db } from "../../db/index.ts";
import {
  payments,
  orders,
  paymentMethods,
  baUser,
  type Payment,
  type NewPayment,
} from "../../db/schema/index.ts";
import { buildPaginatedResult, type DatabaseExecutor } from "./base.repository.ts";
import type { PaymentFilterInput, PaymentStatus } from "../validation/payments.ts";
import type { PaginatedResult } from "../types.ts";

export interface PaymentListItem {
  id: string;
  orderId: string;
  orderNumber: string;
  paymentMethodId: string;
  paymentMethodName: string;
  paymentMethodCode: string;
  status: PaymentStatus;
  amount: string;
  currency: string;
  senderName: string | null;
  senderAccountLast4: string | null;
  transactionReference: string | null;
  proofUrl: string | null;
  verifiedByName: string | null;
  verifiedAt: Date | null;
  rejectionReason: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentDetail extends Payment {
  orderNumber: string;
  orderStatus: string;
  orderTotal: string;
  customerName: string;
  customerEmail: string;
  paymentMethod: {
    id: string;
    name: string;
    code: string;
    type: string;
  };
  verifiedByUser?: {
    id: string;
    name: string;
  } | null;
}

export class PaymentRepository {
  /**
   * Retrieves paginated payment records matching filters.
   */
  async findPaginated(
    filter: PaymentFilterInput,
    executor: DatabaseExecutor = db
  ): Promise<PaginatedResult<PaymentListItem>> {
    const conditions = [];

    if (filter.orderId) {
      conditions.push(eq(payments.orderId, filter.orderId));
    }

    if (filter.status) {
      conditions.push(eq(payments.status, filter.status));
    }

    if (filter.paymentMethodId) {
      conditions.push(eq(payments.paymentMethodId, filter.paymentMethodId));
    }

    if (filter.q) {
      const pattern = `%${filter.q.trim()}%`;
      conditions.push(
        or(
          ilike(payments.transactionReference, pattern),
          ilike(payments.senderName, pattern),
          ilike(orders.orderNumber, pattern)
        )
      );
    }

    if (filter.from) {
      conditions.push(gte(payments.createdAt, new Date(filter.from)));
    }

    if (filter.to) {
      conditions.push(lte(payments.createdAt, new Date(filter.to)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 1. Total count
    const [totalRow] = await executor
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(payments)
      .leftJoin(orders, eq(payments.orderId, orders.id))
      .where(whereClause);

    const total = totalRow?.count ?? 0;
    const offset = (filter.page - 1) * filter.limit;

    // Dynamic sort
    let sortColumn;
    if (filter.sortBy === "amount") {
      sortColumn = payments.amount;
    } else if (filter.sortBy === "status") {
      sortColumn = payments.status;
    } else {
      sortColumn = payments.createdAt;
    }

    const orderExpr = filter.sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

    const rows = await executor
      .select({
        id: payments.id,
        orderId: payments.orderId,
        orderNumber: orders.orderNumber,
        paymentMethodId: payments.paymentMethodId,
        paymentMethodName: paymentMethods.name,
        paymentMethodCode: paymentMethods.code,
        status: payments.status,
        amount: payments.amount,
        currency: payments.currency,
        senderName: payments.senderName,
        senderAccountLast4: payments.senderAccountLast4,
        transactionReference: payments.transactionReference,
        proofUrl: payments.proofUrl,
        verifiedByName: baUser.name,
        verifiedAt: payments.verifiedAt,
        rejectionReason: payments.rejectionReason,
        paidAt: payments.paidAt,
        createdAt: payments.createdAt,
        updatedAt: payments.updatedAt,
      })
      .from(payments)
      .leftJoin(orders, eq(payments.orderId, orders.id))
      .leftJoin(paymentMethods, eq(payments.paymentMethodId, paymentMethods.id))
      .leftJoin(baUser, eq(payments.verifiedBy, baUser.id))
      .where(whereClause)
      .orderBy(orderExpr)
      .limit(filter.limit)
      .offset(offset);

    const items: PaymentListItem[] = rows.map((r) => ({
      ...r,
      orderNumber: r.orderNumber || "Unknown",
      paymentMethodName: r.paymentMethodName || "Payment Method",
      paymentMethodCode: r.paymentMethodCode || "unknown",
      status: r.status as PaymentStatus,
    }));

    return buildPaginatedResult(items, total, filter.page, filter.limit);
  }

  /**
   * Acquires exclusive pessimistic row lock on payment record.
   */
  async findForUpdate(paymentId: string, tx: DatabaseExecutor): Promise<Payment | null> {
    const [row] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .for("update");
    return row || null;
  }

  /**
   * Single deep payment record with verifying admin and order overview.
   */
  async findById(
    id: string,
    executor: DatabaseExecutor = db
  ): Promise<PaymentDetail | null> {
    const [row] = await executor
      .select({
        payment: payments,
        orderNumber: orders.orderNumber,
        orderStatus: orders.status,
        orderTotal: orders.total,
        paymentMethod: paymentMethods,
        verifiedByName: baUser.name,
      })
      .from(payments)
      .leftJoin(orders, eq(payments.orderId, orders.id))
      .leftJoin(paymentMethods, eq(payments.paymentMethodId, paymentMethods.id))
      .leftJoin(baUser, eq(payments.verifiedBy, baUser.id))
      .where(eq(payments.id, id))
      .limit(1);

    if (!row) return null;

    return {
      ...row.payment,
      orderNumber: row.orderNumber || "Unknown",
      orderStatus: row.orderStatus || "unknown",
      orderTotal: row.orderTotal || "0",
      customerName: "Customer",
      customerEmail: "",
      paymentMethod: row.paymentMethod
        ? {
            id: row.paymentMethod.id,
            name: row.paymentMethod.name,
            code: row.paymentMethod.code,
            type: row.paymentMethod.type,
          }
        : {
            id: row.payment.paymentMethodId,
            name: "Payment Method",
            code: "unknown",
            type: "unknown",
          },
      verifiedByUser: row.payment.verifiedBy
        ? {
            id: row.payment.verifiedBy,
            name: row.verifiedByName || "Admin",
          }
        : null,
    };
  }

  /**
   * Retrieves all payments associated with an order.
   */
  async findByOrderId(
    orderId: string,
    executor: DatabaseExecutor = db
  ): Promise<Payment[]> {
    return executor
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .orderBy(desc(payments.createdAt));
  }

  /**
   * Creates new payment record.
   */
  async create(data: NewPayment, executor: DatabaseExecutor = db): Promise<Payment> {
    const [row] = await executor.insert(payments).values(data).returning();
    return row;
  }

  /**
   * Updates payment record.
   */
  async update(
    id: string,
    data: Partial<NewPayment>,
    executor: DatabaseExecutor = db
  ): Promise<Payment | null> {
    const [updated] = await executor
      .update(payments)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, id))
      .returning();
    return updated || null;
  }

  /**
   * Counts payments currently awaiting admin verification.
   */
  async getPendingCount(executor: DatabaseExecutor = db): Promise<number> {
    const [row] = await executor
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(payments)
      .where(eq(payments.status, "awaiting_verification"));
    return row?.count ?? 0;
  }

  /**
   * Reconciles order payments when an order is cancelled (BUG-007).
   * - 'pending' | 'awaiting_verification' | 'rejected' -> 'failed', rejectionReason = 'Order cancelled'.
   * - 'paid' -> leaves as 'paid' and sets metadata.refundRequired = true.
   * - 'refunded' | 'failed' -> no change.
   */
  async markOrderPaymentsCancelled(
    orderId: string,
    tx: DatabaseExecutor
  ): Promise<void> {
    const orderPayments = await tx
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId));

    for (const payment of orderPayments) {
      if (
        payment.status === "pending" ||
        payment.status === "awaiting_verification" ||
        (payment.status as string) === "rejected"
      ) {
        const meta = (payment.metadata as Record<string, any>) || {};
        const rejectionHistory = Array.isArray(meta.rejectionHistory) ? [...meta.rejectionHistory] : [];
        rejectionHistory.push({
          by: "system",
          at: new Date().toISOString(),
          reason: "Order cancelled",
        });

        await tx
          .update(payments)
          .set({
            status: "failed",
            rejectionReason: "Order cancelled",
            metadata: {
              ...meta,
              rejectionHistory,
            },
            updatedAt: new Date(),
          })
          .where(eq(payments.id, payment.id));
      } else if (payment.status === "paid") {
        const meta = (payment.metadata as Record<string, any>) || {};
        await tx
          .update(payments)
          .set({
            metadata: {
              ...meta,
              refundRequired: true,
            },
            updatedAt: new Date(),
          })
          .where(eq(payments.id, payment.id));
      }
    }
  }
}

export const paymentRepository = new PaymentRepository();
