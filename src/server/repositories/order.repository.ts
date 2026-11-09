import { and, desc, asc, eq, sql, ilike, or, gte, lte } from "drizzle-orm";
import { db } from "../../db/index.ts";
import {
  orders,
  orderItems,
  orderItemEngraving,
  orderCoupons,
  orderNotes,
  orderStatusHistory,
  orderReturns,
  orderReturnItems,
  customers,
  paymentMethods,
  shippingMethods,
  payments,
  coupons,
  baUser,
  type Order,
  type NewOrder,
  type NewOrderItem,
  type NewOrderItemEngraving,
  type NewPayment,
  type OrderItem,
  type OrderItemEngraving,
  type Payment,
  type OrderNote,
  type OrderStatusHistory,
  type OrderReturn,
  type OrderReturnItem,
} from "../../db/schema/index.ts";
import { buildPaginatedResult, type DatabaseExecutor } from "./base.repository.ts";
import { couponRepository, CouponRepository } from "./coupon.repository.ts";
import type { OrderFilterInput, OrderStatus } from "../validation/orders.ts";
import type { PaginatedResult } from "../types.ts";

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: string;
  subtotal: string;
  hasEngraving: boolean;
  placedAt: Date;
  customer: {
    id: string;
    email: string;
    name: string;
    phone: string | null;
  };
  paymentMethodName: string | null;
  paymentStatus: string | null;
  itemsCount: number;
}

export interface OrderDetailBundle extends Order {
  customer: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  };
  paymentMethod: {
    id: string;
    code: string;
    name: string;
    type: string;
  } | null;
  shippingMethod: {
    id: string;
    name: string;
  } | null;
  items: (OrderItem & {
    engravings: OrderItemEngraving[];
  })[];
  payments: Payment[];
  coupons: {
    couponId: string;
    code: string;
    discountAmount: string;
  }[];
  internalNotes: (OrderNote & {
    createdByUser?: { id: string; name: string } | null;
  })[];
  statusHistory: OrderStatusHistory[];
}

export interface OrderSummaryMetrics {
  totalOrders: number;
  totalRevenue: number;
  awaitingPaymentCount: number;
  paymentSubmittedCount: number;
  processingCount: number;
  shippedCount: number;
  deliveredCount: number;
}

export class OrderRepository {
  private readonly couponRepo: CouponRepository;

  constructor(couponRepo: CouponRepository = couponRepository) {
    this.couponRepo = couponRepo;
  }

  /**
   * Retrieves paginated orders with dynamic filtering and customer/item aggregations.
   */
  async findPaginated(
    filter: OrderFilterInput,
    executor: DatabaseExecutor = db
  ): Promise<PaginatedResult<OrderListItem>> {
    const conditions = [];

    if (filter.q) {
      const pattern = `%${filter.q.trim()}%`;
      conditions.push(
        or(
          ilike(orders.orderNumber, pattern),
          ilike(customers.email, pattern),
          ilike(customers.firstName, pattern),
          ilike(customers.lastName, pattern),
          ilike(orders.contactPhone, pattern),
          ilike(orders.trackingNumber, pattern)
        )
      );
    }

    if (filter.status) {
      conditions.push(eq(orders.status, filter.status));
    }

    // BUG-016: Payment status filter
    if (filter.paymentStatus) {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM payments p
        WHERE p.order_id = ${orders.id} AND p.status = ${filter.paymentStatus}
      )`);
    }

    if (filter.paymentMethodId) {
      conditions.push(eq(orders.paymentMethodId, filter.paymentMethodId));
    }

    if (filter.customerId) {
      conditions.push(eq(orders.customerId, filter.customerId));
    }

    if (filter.hasEngraving !== undefined) {
      conditions.push(eq(orders.hasEngraving, filter.hasEngraving));
    }

    if (filter.from) {
      conditions.push(gte(orders.placedAt, new Date(filter.from)));
    }

    if (filter.to) {
      conditions.push(lte(orders.placedAt, new Date(filter.to)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 1. Total count (without order_items join, orders is 1:1 with customers)
    const [totalRow] = await executor
      .select({ count: sql<number>`cast(count(${orders.id}) as integer)` })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(whereClause);

    const total = totalRow?.count ?? 0;
    const offset = (filter.page - 1) * filter.limit;

    // Dynamic sort
    let sortColumn;
    if (filter.sortBy === "total") {
      sortColumn = orders.total;
    } else if (filter.sortBy === "status") {
      sortColumn = orders.status;
    } else if (filter.sortBy === "orderNumber") {
      sortColumn = orders.orderNumber;
    } else {
      sortColumn = orders.placedAt;
    }

    const orderExpr = filter.sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

    // BUG-016 & PERF-003: Subquery per row eliminates Cartesian product and full-table GROUP BY
    const rows = await executor
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        total: orders.total,
        subtotal: orders.subtotal,
        hasEngraving: orders.hasEngraving,
        placedAt: orders.placedAt,
        customerId: customers.id,
        customerEmail: customers.email,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        customerPhone: customers.phone,
        paymentMethodName: paymentMethods.name,
        latestPaymentStatus: sql<string | null>`(
          select p.status from payments p where p.order_id = ${orders.id} order by p.created_at desc limit 1
        )`,
        itemsCount: sql<number>`cast(coalesce((select sum(oi.quantity) from order_items oi where oi.order_id = ${orders.id}), 0) as integer)`,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(paymentMethods, eq(orders.paymentMethodId, paymentMethods.id))
      .where(whereClause)
      .orderBy(orderExpr)
      .limit(filter.limit)
      .offset(offset);

    const items: OrderListItem[] = rows.map((r) => ({
      id: r.id,
      orderNumber: r.orderNumber,
      status: r.status as OrderStatus,
      total: r.total,
      subtotal: r.subtotal,
      hasEngraving: r.hasEngraving,
      placedAt: r.placedAt,
      customer: {
        id: r.customerId || "",
        email: r.customerEmail || "",
        name: [r.customerFirstName, r.customerLastName].filter(Boolean).join(" ") || r.customerEmail || "Customer",
        phone: r.customerPhone,
      },
      paymentMethodName: r.paymentMethodName,
      paymentStatus: r.latestPaymentStatus,
      itemsCount: r.itemsCount,
    }));

    return buildPaginatedResult(items, total, filter.page, filter.limit);
  }

  /**
   * Acquires exclusive pessimistic row lock on order row for concurrent status updates.
   */
  async findForUpdate(orderId: string, tx: DatabaseExecutor): Promise<Order | null> {
    const [row] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update");
    return row || null;
  }

  /**
   * Retrieves single deep order bundle with line items, engravings, payments, notes, and history.
   */
  async findById(
    id: string,
    executor: DatabaseExecutor = db
  ): Promise<OrderDetailBundle | null> {
    const [orderRow] = await executor
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);

    if (!orderRow) return null;

    const [customerRow] = await executor
      .select()
      .from(customers)
      .where(eq(customers.id, orderRow.customerId))
      .limit(1);

    const paymentMethodRow = orderRow.paymentMethodId
      ? (
          await executor
            .select()
            .from(paymentMethods)
            .where(eq(paymentMethods.id, orderRow.paymentMethodId))
            .limit(1)
        )[0]
      : null;

    const shippingMethodRow = orderRow.shippingMethodId
      ? (
          await executor
            .select()
            .from(shippingMethods)
            .where(eq(shippingMethods.id, orderRow.shippingMethodId))
            .limit(1)
        )[0]
      : null;

    // Line items
    const rawItems = await executor
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, id))
      .orderBy(orderItems.createdAt);

    const itemsWithEngravings = await Promise.all(
      rawItems.map(async (item) => {
        const itemEngravings = await executor
          .select()
          .from(orderItemEngraving)
          .where(eq(orderItemEngraving.orderItemId, item.id));
        return {
          ...item,
          engravings: itemEngravings,
        };
      })
    );

    // Payments
    const orderPayments = await executor
      .select()
      .from(payments)
      .where(eq(payments.orderId, id))
      .orderBy(desc(payments.createdAt));

    // Coupons
    const orderCouponsList = await executor
      .select({
        couponId: coupons.id,
        code: coupons.code,
        discountAmount: orderCoupons.discountAmount,
      })
      .from(orderCoupons)
      .innerJoin(coupons, eq(orderCoupons.couponId, coupons.id))
      .where(eq(orderCoupons.orderId, id));

    // Notes
    const notesList = await executor
      .select({
        id: orderNotes.id,
        orderId: orderNotes.orderId,
        body: orderNotes.body,
        createdBy: orderNotes.createdBy,
        createdAt: orderNotes.createdAt,
        createdByName: baUser.name,
      })
      .from(orderNotes)
      .leftJoin(baUser, eq(orderNotes.createdBy, baUser.id))
      .where(eq(orderNotes.orderId, id))
      .orderBy(desc(orderNotes.createdAt));

    const formattedNotes = notesList.map((n) => ({
      id: n.id,
      orderId: n.orderId,
      body: n.body,
      createdBy: n.createdBy,
      createdAt: n.createdAt,
      createdByUser: n.createdBy ? { id: n.createdBy, name: n.createdByName ?? "Staff" } : null,
    }));

    // Status History
    const statusHistoryList = await executor
      .select({
        id: orderStatusHistory.id,
        orderId: orderStatusHistory.orderId,
        fromStatus: orderStatusHistory.fromStatus,
        toStatus: orderStatusHistory.toStatus,
        note: orderStatusHistory.note,
        changedBy: orderStatusHistory.changedBy,
        authorName: baUser.name,
        createdAt: orderStatusHistory.createdAt,
      })
      .from(orderStatusHistory)
      .leftJoin(baUser, eq(baUser.id, orderStatusHistory.changedBy))
      .where(eq(orderStatusHistory.orderId, id))
      .orderBy(desc(orderStatusHistory.createdAt));

    return {
      ...orderRow,
      customer: {
        id: customerRow?.id ?? orderRow.customerId,
        email: customerRow?.email ?? "",
        firstName: customerRow?.firstName ?? null,
        lastName: customerRow?.lastName ?? null,
        phone: customerRow?.phone ?? null,
      },
      paymentMethod: paymentMethodRow
        ? {
            id: paymentMethodRow.id,
            code: paymentMethodRow.code,
            name: paymentMethodRow.name,
            type: paymentMethodRow.type,
          }
        : null,
      shippingMethod: shippingMethodRow
        ? {
            id: shippingMethodRow.id,
            name: shippingMethodRow.name,
          }
        : null,
      items: itemsWithEngravings,
      payments: orderPayments,
      coupons: orderCouponsList,
      internalNotes: formattedNotes,
      statusHistory: statusHistoryList,
    };
  }

  /**
   * Find order by unique human-readable order number (e.g. SX-1001).
   */
  async findByOrderNumber(
    orderNumber: string,
    executor: DatabaseExecutor = db
  ): Promise<Order | null> {
    const [row] = await executor
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber.trim()))
      .limit(1);
    return row || null;
  }

  /**
   * Atomic Order Creation Bundle.
   * Inserts order base, items, engravings, coupons, initial payment, and initial status history.
   */
  async createOrderBundle(
    data: {
      order: NewOrder;
      items: Array<{
        item: Omit<NewOrderItem, "orderId">;
        engravings?: Omit<NewOrderItemEngraving, "orderItemId">[];
      }>;
      coupon?: { couponId: string; discountAmount: string };
      initialPayment?: Omit<NewPayment, "orderId">;
    },
    tx: DatabaseExecutor
  ): Promise<OrderDetailBundle> {
    // 1. Insert Order
    const [createdOrder] = await tx.insert(orders).values(data.order).returning();

    // 2. Insert Order Items & Engravings
    for (const itemData of data.items) {
      const [createdItem] = await tx
        .insert(orderItems)
        .values({
          ...itemData.item,
          orderId: createdOrder.id,
        })
        .returning();

      if (itemData.engravings && itemData.engravings.length > 0) {
        for (const eng of itemData.engravings) {
          await tx.insert(orderItemEngraving).values({
            ...eng,
            orderItemId: createdItem.id,
          });
        }
      }
    }

    // 3. Insert Coupon if applied (delegates authoritative redemption recording to couponRepo)
    if (data.coupon) {
      await this.couponRepo.recordRedemption(
        createdOrder.id,
        data.coupon.couponId,
        data.coupon.discountAmount,
        tx
      );
    }

    // 4. Insert Initial Payment Record if non-COD
    if (data.initialPayment) {
      await tx.insert(payments).values({
        ...data.initialPayment,
        orderId: createdOrder.id,
      });
    }

    // 5. Initial Status History
    await tx.insert(orderStatusHistory).values({
      orderId: createdOrder.id,
      fromStatus: null,
      toStatus: createdOrder.status,
      note: "Order placed.",
      changedBy: "system",
    });

    const bundle = await this.findById(createdOrder.id, tx);
    return bundle!;
  }

  /**
   * Updates order status with historical status log.
   */
  async updateOrderStatus(
    orderId: string,
    toStatus: OrderStatus,
    fromStatus: OrderStatus | null,
    note: string | null,
    changedBy: string | null,
    tx: DatabaseExecutor
  ): Promise<Order> {
    const updateData: Record<string, unknown> = {
      status: toStatus,
      updatedAt: new Date(),
    };

    if (toStatus === "cancelled") {
      updateData.cancelledAt = new Date();
    } else if (toStatus === "shipped") {
      updateData.shippedAt = new Date();
    } else if (toStatus === "delivered") {
      updateData.deliveredAt = new Date();
    }

    const [updatedOrder] = await tx
      .update(orders)
      .set(updateData)
      .where(eq(orders.id, orderId))
      .returning();

    await tx.insert(orderStatusHistory).values({
      orderId,
      fromStatus,
      toStatus,
      note: note || `Status changed to ${toStatus}.`,
      changedBy: changedBy || "system",
    });

    return updatedOrder;
  }

  /**
   * Updates shipping and courier details.
   */
  /**
   * Updates order courier and tracking number.
   * Defensively restricted to shipping metadata only; cannot alter order status or timestamps (BUG-006).
   */
  async updateShippingInfo(
    orderId: string,
    data: {
      courier?: string | null;
      trackingNumber?: string | null;
    },
    tx: DatabaseExecutor
  ): Promise<Order> {
    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (data.courier !== undefined) updatePayload.courier = data.courier;
    if (data.trackingNumber !== undefined) updatePayload.trackingNumber = data.trackingNumber;

    const [updated] = await tx
      .update(orders)
      .set(updatePayload)
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
  }

  /**
   * Appends internal administrative order note.
   */
  async addNote(
    data: { orderId: string; body: string; createdBy: string | null },
    executor: DatabaseExecutor = db
  ): Promise<OrderNote> {
    const [note] = await executor.insert(orderNotes).values(data).returning();
    return note;
  }

  /**
   * Aggregates key order performance metrics across store.
   */
  async getOrderMetrics(executor: DatabaseExecutor = db): Promise<OrderSummaryMetrics> {
    const [metrics] = await executor
      .select({
        totalOrders: sql<number>`cast(count(*) as integer)`,
        totalRevenue: sql<number>`cast(coalesce(sum(case when status in ('confirmed', 'processing', 'shipped', 'delivered') then total else 0 end), 0) as float)`,
        awaitingPaymentCount: sql<number>`cast(count(case when status = 'awaiting_payment' then 1 end) as integer)`,
        paymentSubmittedCount: sql<number>`cast(count(case when status = 'payment_submitted' then 1 end) as integer)`,
        processingCount: sql<number>`cast(count(case when status = 'processing' then 1 end) as integer)`,
        shippedCount: sql<number>`cast(count(case when status = 'shipped' then 1 end) as integer)`,
        deliveredCount: sql<number>`cast(count(case when status = 'delivered' then 1 end) as integer)`,
      })
      .from(orders);

    return {
      totalOrders: metrics?.totalOrders ?? 0,
      totalRevenue: metrics?.totalRevenue ?? 0,
      awaitingPaymentCount: metrics?.awaitingPaymentCount ?? 0,
      paymentSubmittedCount: metrics?.paymentSubmittedCount ?? 0,
      processingCount: metrics?.processingCount ?? 0,
      shippedCount: metrics?.shippedCount ?? 0,
      deliveredCount: metrics?.deliveredCount ?? 0,
    };
  }

  /**
   * Counts orders marked as delivered within the current month (in Asia/Karachi store timezone).
   */
  async getDeliveredThisMonthCount(executor: DatabaseExecutor = db): Promise<number> {
    const [row] = await executor
      .select({
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(orders)
      .where(
        sql`status = 'delivered' AND coalesce(delivered_at, updated_at) >= date_trunc('month', now() AT TIME ZONE 'Asia/Karachi') AT TIME ZONE 'Asia/Karachi'`
      );

    return row?.count ?? 0;
  }

  /**
   * ECOM-002: Creates an order return bundle with return items.
   */
  async createReturnBundle(
    data: {
      orderId: string;
      reason: string;
      requestedBy?: string | null;
      replacementOrderId?: string | null;
      notes?: string | null;
      items: Array<{ orderItemId: string; quantity: number; restock?: boolean }>;
    },
    executor: DatabaseExecutor = db
  ): Promise<{ returnRecord: OrderReturn; items: OrderReturnItem[] }> {
    const [returnRecord] = await executor
      .insert(orderReturns)
      .values({
        orderId: data.orderId,
        reason: data.reason,
        requestedBy: data.requestedBy || null,
        replacementOrderId: data.replacementOrderId || null,
        notes: data.notes || null,
        status: "requested",
      })
      .returning();

    const items: OrderReturnItem[] = [];
    for (const itm of data.items) {
      const [createdItem] = await executor
        .insert(orderReturnItems)
        .values({
          returnId: returnRecord.id,
          orderItemId: itm.orderItemId,
          quantity: itm.quantity,
          restock: itm.restock ?? true,
        })
        .returning();
      items.push(createdItem);
    }

    return { returnRecord, items };
  }

  /**
   * Finds a return by ID with its items.
   */
  async findReturnById(
    returnId: string,
    executor: DatabaseExecutor = db
  ): Promise<(OrderReturn & { items: OrderReturnItem[] }) | null> {
    const [returnRecord] = await executor
      .select()
      .from(orderReturns)
      .where(eq(orderReturns.id, returnId))
      .limit(1);

    if (!returnRecord) return null;

    const items = await executor
      .select()
      .from(orderReturnItems)
      .where(eq(orderReturnItems.returnId, returnId));

    return { ...returnRecord, items };
  }

  /**
   * Finds all returns associated with an order.
   */
  async findReturnsByOrderId(
    orderId: string,
    executor: DatabaseExecutor = db
  ): Promise<Array<OrderReturn & { items: OrderReturnItem[] }>> {
    const returnRows = await executor
      .select()
      .from(orderReturns)
      .where(eq(orderReturns.orderId, orderId))
      .orderBy(desc(orderReturns.createdAt));

    const results: Array<OrderReturn & { items: OrderReturnItem[] }> = [];
    for (const ret of returnRows) {
      const items = await executor
        .select()
        .from(orderReturnItems)
        .where(eq(orderReturnItems.returnId, ret.id));
      results.push({ ...ret, items });
    }
    return results;
  }

  /**
   * Updates an order return.
   */
  async updateReturn(
    returnId: string,
    data: Partial<Omit<OrderReturn, "id" | "orderId" | "createdAt">>,
    executor: DatabaseExecutor = db
  ): Promise<OrderReturn> {
    const [updated] = await executor
      .update(orderReturns)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(orderReturns.id, returnId))
      .returning();
    return updated;
  }
}

export const orderRepository = new OrderRepository();
