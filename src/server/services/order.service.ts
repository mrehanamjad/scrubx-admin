import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import {
  orderRepository,
  OrderRepository,
  type OrderListItem,
  type OrderDetailBundle,
  type OrderSummaryMetrics,
} from "../repositories/order.repository.ts";
import type { DatabaseExecutor } from "../repositories/base.repository.ts";
import { customerRepository, CustomerRepository } from "../repositories/customer.repository.ts";
import { paymentRepository, PaymentRepository } from "../repositories/payment.repository.ts";
import { inventoryService, InventoryService } from "./inventory.service.ts";
import { couponService as defaultCouponService, CouponService } from "./coupon.service.ts";
import { assertRole, type AdminContext } from "../auth.ts";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from "../errors.ts";
import type {
  OrderFilterInput,
  CreateOrderInput,
  UpdateOrderStatusInput,
  UpdateOrderShippingInput,
  AddOrderNoteInput,
  RequestOrderReturnInput,
  ApproveOrderReturnInput,
  ReceiveOrderReturnInput,
  CompleteOrderReturnInput,
  CreateOrderExchangeInput,
} from "../validation/orders.ts";
import {
  ALLOWED_STATUS_TRANSITIONS,
  canTransition,
  type OrderStatus,
} from "../../lib/order-status.ts";
import type { PaginatedResult } from "../types.ts";
import {
  productVariants,
  products,
  productColors,
  paymentMethods,
  shippingMethods,
  engravingOptions,
  coupons,
  customers,
  orders,
  inventory,
  baUser,
  type Order,
  type OrderNote,
} from "../../db/schema/index.ts";

export class OrderService {
  private readonly orderRepo: OrderRepository;
  private readonly customerRepo: CustomerRepository;
  private readonly invService: InventoryService;
  private readonly couponService: CouponService;
  private readonly paymentRepo: PaymentRepository;

  constructor(
    orderRepo: OrderRepository = orderRepository,
    customerRepo: CustomerRepository = customerRepository,
    invService: InventoryService = inventoryService,
    couponService: CouponService = defaultCouponService,
    paymentRepo: PaymentRepository = paymentRepository
  ) {
    this.orderRepo = orderRepo;
    this.customerRepo = customerRepo;
    this.invService = invService;
    this.couponService = couponService;
    this.paymentRepo = paymentRepo;
  }

  /**
   * Retrieves paginated orders matching filters.
   * Requires at least staff role.
   */
  async getOrders(
    filter: OrderFilterInput,
    admin: AdminContext
  ): Promise<PaginatedResult<OrderListItem>> {
    assertRole(admin, ["staff"]);
    return this.orderRepo.findPaginated(filter);
  }

  /**
   * Retrieves single deep order details bundle.
   * Requires at least staff role.
   */
  async getOrderById(id: string, admin: AdminContext): Promise<OrderDetailBundle> {
    assertRole(admin, ["staff"]);
    const order = await this.orderRepo.findById(id);
    if (!order) {
      throw new NotFoundError("Order", id);
    }
    return order;
  }

  /**
   * KPI metrics for order queue dashboard.
   * Requires at least staff role.
   */
  async getOrderMetrics(admin: AdminContext): Promise<OrderSummaryMetrics> {
    assertRole(admin, ["staff"]);
    return this.orderRepo.getOrderMetrics();
  }

  /**
   * Counts orders delivered in the current month in Karachi timezone.
   * Requires at least staff role.
   */
  async getDeliveredThisMonthCount(admin: AdminContext): Promise<number> {
    assertRole(admin, ["staff"]);
    return this.orderRepo.getDeliveredThisMonthCount();
  }

  /**
   * Creates order bundle with item snapshots, stock reservation, and trigger guards.
   * Strictly requires administrative context (Staff or Admin).
   */
  async createOrder(
    input: CreateOrderInput,
    admin: AdminContext
  ): Promise<OrderDetailBundle> {
    assertRole(admin, ["staff"]);

    // 1. Idempotency check
    if (input.idempotencyKey) {
      const [existing] = await db
        .select()
        .from(orders)
        .where(eq(orders.idempotencyKey, input.idempotencyKey.trim()))
        .limit(1);

      if (existing) {
        return (await this.orderRepo.findById(existing.id))!;
      }
    }

    return db.transaction(async (tx) => {
      // 2. Customer resolution / atomic deduplication (BUG-001, DB-001, DB-010)
      let customerId = input.customerId;
      if (!customerId && input.customer) {
        // DB-010: Check if matching ba_user exists for this email
        const [matchingUser] = await tx
          .select({ id: baUser.id })
          .from(baUser)
          .where(sql`lower(trim(${baUser.email})) = lower(trim(${input.customer.email}))`)
          .limit(1);

        const cust = await this.customerRepo.upsertCustomer(
          {
            ...input.customer,
            userId: matchingUser?.id ?? null,
          },
          tx
        );
        customerId = cust.id;
      }

      if (!customerId) {
        throw new ValidationError("Customer identification is required.");
      }

      // Verify customer exists in customers table (BUG-001)
      if (input.customerId) {
        const [custRecord] = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.id, customerId))
          .limit(1);

        if (!custRecord) {
          throw new NotFoundError("Customer", customerId);
        }
      }

      // 3. Payment Method & COD Trigger Guard
      const [paymentMethod] = await tx
        .select()
        .from(paymentMethods)
        .where(eq(paymentMethods.id, input.paymentMethodId))
        .limit(1);

      if (!paymentMethod || !paymentMethod.isActive) {
        throw new ValidationError("Selected payment method is invalid or inactive.");
      }

      // 4. Cart Normalization, Aggregation & Availability Checks (BUG-002, BUG-004)
      const aggregatedStock = new Map<string, number>();
      for (const item of input.items) {
        aggregatedStock.set(
          item.variantId,
          (aggregatedStock.get(item.variantId) ?? 0) + item.quantity
        );
      }
      const lockOrder = [...aggregatedStock.keys()].sort(); // Deterministic row lock order

      const variantRows = await tx
        .select({
          variantId: productVariants.id,
          sku: productVariants.sku,
          price: productVariants.price,
          size: productVariants.size,
          isActive: productVariants.isActive,
          colorName: productColors.name,
          productName: products.name,
          productStatus: products.status,
          deletedAt: products.deletedAt,
          quantityOnHand: inventory.quantityOnHand,
          quantityReserved: inventory.quantityReserved,
        })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.productId, products.id))
        .leftJoin(productColors, eq(productVariants.colorId, productColors.id))
        .leftJoin(inventory, eq(productVariants.id, inventory.variantId))
        .where(inArray(productVariants.id, lockOrder));

      const variantMap = new Map(variantRows.map((v) => [v.variantId, v]));

      // Verify all variants exist and check stock against aggregated totals
      for (const variantId of lockOrder) {
        const v = variantMap.get(variantId);
        if (!v) {
          throw new NotFoundError("Product variant", variantId);
        }

        // BUG-002: Enforce active, non-archived, non-deleted product and active variant
        if (v.deletedAt !== null) {
          throw new ValidationError(`Product '${v.productName}' is no longer available.`);
        }
        if (v.productStatus !== "active") {
          throw new ValidationError(
            `Product '${v.productName}' is not available for ordering (status: ${v.productStatus}).`
          );
        }
        if (!v.isActive) {
          throw new ValidationError(`The selected variant of '${v.productName}' is no longer available.`);
        }

        const requiredQty = aggregatedStock.get(variantId)!;
        const availableStock = Math.max(0, (v.quantityOnHand ?? 0) - (v.quantityReserved ?? 0));
        if (availableStock < requiredQty) {
          throw new ConflictError(
            `Insufficient stock for '${v.productName} (${v.sku})'. Available: ${availableStock}, Requested: ${requiredQty}.`
          );
        }
      }

      let subtotal = 0;
      let engravingTotal = 0;
      let hasEngraving = false;
      const orderItemsToInsert = [];

      for (const itemInput of input.items) {
        const v = variantMap.get(itemInput.variantId)!;
        const unitPriceNum = Number(v.price);
        subtotal += unitPriceNum * itemInput.quantity;

        // Engraving validation & snapshot (BUG-013)
        const itemEngravings = [];
        if (itemInput.engraving) {
          hasEngraving = true;
          const [engOpt] = await tx
            .select()
            .from(engravingOptions)
            .where(eq(engravingOptions.id, itemInput.engraving.engravingOptionId))
            .limit(1);

          if (!engOpt || !engOpt.isActive) {
            throw new ValidationError("Selected engraving option is invalid or inactive.");
          }

          const payload = itemInput.engraving;
          if (engOpt.type === "name") {
            const trimmedText = payload.text?.trim();
            if (!trimmedText) {
              throw new ValidationError(`Engraving option '${engOpt.name}' requires engraved text.`);
            }
            const maxChars = engOpt.maxCharacters ?? 20;
            if (trimmedText.length > maxChars) {
              throw new ValidationError(
                `Engraving text for '${engOpt.name}' exceeds the ${maxChars}-character limit.`
              );
            }
          } else if (engOpt.type === "logo") {
            if (!payload.logoUrl?.trim()) {
              throw new ValidationError(`Engraving option '${engOpt.name}' requires a logo file.`);
            }
            if (payload.logoImagekitFileId && !/^[a-zA-Z0-9_-]+$/.test(payload.logoImagekitFileId)) {
              throw new ValidationError("Invalid engraving logo reference.");
            }
          }

          const engPriceNum = Number(engOpt.price);
          engravingTotal += engPriceNum * itemInput.quantity;

          itemEngravings.push({
            engravingOptionId: engOpt.id,
            text: itemInput.engraving.text || null,
            logoUrl: itemInput.engraving.logoUrl || null,
            logoImagekitFileId: itemInput.engraving.logoImagekitFileId || null,
            placement: itemInput.engraving.placement || "Left Chest",
            price: engOpt.price,
          });
        }

        orderItemsToInsert.push({
          item: {
            variantId: v.variantId,
            sku: v.sku,
            productName: v.productName,
            variantName: [v.colorName, v.size].filter(Boolean).join(" / ") || "Standard",
            imageUrl: null,
            unitPrice: v.price,
            quantity: itemInput.quantity,
          },
          engravings: itemEngravings,
        });
      }

      // 5. Engraving + COD Business Rule & Database Trigger Guard
      if (hasEngraving && !paymentMethod.allowedWithEngraving) {
        throw new ValidationError("Custom engraved orders cannot be placed with Cash on Delivery.");
      }

      // 6. Shipping & Coupon Calculation (BUG-003)
      let shippingTotal = 0;
      let shippingMethodName: string | null = null;
      if (input.shippingMethodId) {
        const [sm] = await tx
          .select()
          .from(shippingMethods)
          .where(eq(shippingMethods.id, input.shippingMethodId))
          .limit(1);

        if (!sm) {
          throw new NotFoundError("Shipping method", input.shippingMethodId);
        }
        if (!sm.isActive) {
          throw new ValidationError("Selected shipping method is inactive.");
        }

        shippingMethodName = sm.name;
        const priceNum = Number(sm.price);
        const freeAboveNum = sm.freeAbove ? Number(sm.freeAbove) : null;
        if (freeAboveNum !== null && subtotal >= freeAboveNum) {
          shippingTotal = 0;
        } else {
          shippingTotal = priceNum;
        }
      }

      // 7. Dual-Counter Inventory Reservation (BUG-004: locks acquired in deterministic sort order)
      for (const variantId of lockOrder) {
        await this.invService.reserveStock(
          variantId,
          aggregatedStock.get(variantId)!,
          undefined,
          tx
        );
      }

      // 8. Authoritative Coupon Validation & Row Lock (Locks coupon row per ADR 020)
      let discountTotal = 0;
      let appliedCoupon: { couponId: string; discountAmount: string } | undefined;
      if (input.couponCode) {
        const couponResult = await this.couponService.validateAndLockForOrder(
          input.couponCode,
          subtotal,
          customerId,
          tx
        );
        discountTotal = couponResult.discountAmount;
        appliedCoupon = {
          couponId: couponResult.coupon.id,
          discountAmount: discountTotal.toFixed(2),
        };
      }

      const total = Math.max(0, subtotal + engravingTotal - discountTotal + shippingTotal);

      // 9. Initial Status Determination & Expiration Window (ECOM-001)
      const isCod = paymentMethod.type === "cod";
      const initialStatus: OrderStatus = isCod ? "pending" : "awaiting_payment";
      const paymentWindowHours = 48;
      const paymentDueAt = !isCod ? new Date(Date.now() + paymentWindowHours * 3600 * 1000) : null;

      // 10. Generate Collision-Free Monotonic Order Number (BUG-005)
      let orderBundle;
      let attempts = 0;
      while (attempts < 3) {
        try {
          const seqRes = await tx.execute(
            sql`SELECT 'SX-' || nextval('order_number_seq') AS "orderNumber"`
          );
          const generatedOrderNumber = String((seqRes as any)[0]?.orderNumber);

          orderBundle = await this.orderRepo.createOrderBundle(
            {
              order: {
                customerId,
                orderNumber: generatedOrderNumber,
                status: initialStatus,
                currency: "PKR",
                subtotal: subtotal.toFixed(2),
                engravingTotal: engravingTotal.toFixed(2),
                discountTotal: discountTotal.toFixed(2),
                shippingTotal: shippingTotal.toFixed(2),
                taxTotal: "0.00",
                total: total.toFixed(2),
                hasEngraving,
                paymentMethodId: input.paymentMethodId,
                paymentDueAt,
                shippingMethodId: input.shippingMethodId || null,
                shippingMethodName,
                contactPhone: input.shippingAddress.phone,
                shippingAddress: input.shippingAddress,
                notes: input.notes || null,
                idempotencyKey: input.idempotencyKey || null,
              },
              items: orderItemsToInsert,
              coupon: appliedCoupon,
              initialPayment: !isCod
                ? {
                    paymentMethodId: input.paymentMethodId,
                    status: "pending",
                    amount: total.toFixed(2),
                    currency: "PKR",
                    metadata: {},
                  }
                : undefined,
            },
            tx
          );
          break;
        } catch (err: any) {
          attempts++;
          if (err?.code === "23505" && String(err?.constraint).includes("order_number") && attempts < 3) {
            continue;
          }
          throw err;
        }
      }

      return orderBundle!;
    });
  }

  /**
   * Updates order status with strict transition validation, lock ordering, and inventory synchronization.
   * Strictly requires administrator (admin or super_admin) role.
   */
  async updateOrderStatus(
    input: UpdateOrderStatusInput,
    admin: AdminContext,
    existingTx?: DatabaseExecutor
  ): Promise<Order> {
    assertRole(admin, ["admin"]);

    const executeUpdate = async (tx: DatabaseExecutor) => {
      // 1. Lock Order First (enforcing uniform lock ordering: 1. orders -> 2. payments -> 3. inventory)
      const currentOrder = await this.orderRepo.findForUpdate(input.orderId, tx);
      if (!currentOrder) {
        throw new NotFoundError("Order", input.orderId);
      }

      const fromStatus = currentOrder.status as OrderStatus;
      const toStatus = input.status;

      if (fromStatus === toStatus) {
        return currentOrder;
      }

      // 2. Validate Permitted State Transition (ARCH-005)
      if (!canTransition(fromStatus, toStatus)) {
        throw new ValidationError(
          `Cannot transition order status from '${fromStatus}' to '${toStatus}'.`
        );
      }

      const orderLineItems = await this.orderRepo.findById(input.orderId, tx);
      const itemsList = orderLineItems?.items ?? [];

      // 3. Status Action: Idempotent Stock Commitment on Confirmed (BUG-012)
      if (toStatus === "confirmed") {
        const isCod = currentOrder.paymentMethodId
          ? (await tx.select().from(paymentMethods).where(eq(paymentMethods.id, currentOrder.paymentMethodId)).limit(1))[0]?.type === "cod"
          : currentOrder.status === "pending";
        const paymentsList = await this.paymentRepo.findByOrderId(currentOrder.id, tx);
        const hasPaid = paymentsList.some((p) => p.status === "paid");
        if (!hasPaid && !isCod) {
          throw new ValidationError(
            "Order cannot be confirmed without a verified payment. Approve the payment first, or record the order as Cash on Delivery."
          );
        }

        for (const item of itemsList) {
          if (item.variantId) {
            await this.invService.commitOrderSale(
              item.variantId,
              item.quantity,
              currentOrder.id,
              admin.id,
              tx
            );
          }
        }
      }

      // 4. Status Action: Explicit Cancellation Scenarios (BUG-007)
      if (toStatus === "cancelled") {
        const wasCommitted = ["confirmed", "processing"].includes(fromStatus);
        const wasDispatched = ["shipped", "delivered"].includes(fromStatus);

        if (!wasDispatched) {
          // Scenario A (unpaid: release reservation) or Scenario B (paid unshipped: restore warehouse stock)
          for (const item of itemsList) {
            if (item.variantId) {
              await this.invService.cancelOrderStock(
                item.variantId,
                item.quantity,
                currentOrder.id,
                wasCommitted,
                admin.id,
                tx
              );
            }
          }
        }
        // Scenario C (wasDispatched): Goods are with courier/customer; DO NOT automatically restock.
        // Reconcile satellite payments & coupons (BUG-007)
        await this.paymentRepo.markOrderPaymentsCancelled(currentOrder.id, tx);
        await this.couponService.releaseOrderRedemption(currentOrder.id, tx);
      }

      // 5. Status Action: Refund Reconciliation (BUG-007)
      if (toStatus === "refunded") {
        await this.couponService.releaseOrderRedemption(currentOrder.id, tx);
      }

      // 6. Update Order Status in Database
      const updated = await this.orderRepo.updateOrderStatus(
        currentOrder.id,
        toStatus,
        fromStatus,
        input.note || null,
        admin.id,
        tx
      );

      return updated;
    };

    if (existingTx) {
      return executeUpdate(existingTx);
    }
    return db.transaction(executeUpdate);
  }

  /**
   * Updates courier tracking number and courier name.
   * Strictly requires administrator role (BUG-006).
   * Status transitions cannot be triggered through shipping update.
   */
  async updateOrderShipping(
    input: UpdateOrderShippingInput,
    admin: AdminContext
  ): Promise<Order> {
    assertRole(admin, ["admin"]);

    return db.transaction(async (tx) => {
      const current = await this.orderRepo.findForUpdate(input.orderId, tx);
      if (!current) {
        throw new NotFoundError("Order", input.orderId);
      }

      const updated = await this.orderRepo.updateShippingInfo(
        input.orderId,
        {
          courier: input.courier,
          trackingNumber: input.trackingNumber,
        },
        tx
      );

      return updated;
    });
  }

  /**
   * Appends internal team note to order.
   * Requires at least staff role.
   */
  async addOrderNote(input: AddOrderNoteInput, admin: AdminContext): Promise<OrderNote> {
    assertRole(admin, ["staff"]);
    const order = await this.orderRepo.findById(input.orderId);
    if (!order) {
      throw new NotFoundError("Order", input.orderId);
    }

    return this.orderRepo.addNote({
      orderId: input.orderId,
      body: input.body,
      createdBy: admin.userId || (admin as any).id,
    });
  }

  /**
   * ECOM-001: Expire unpaid orders whose payment due date has passed.
   * Selects orders with status 'awaiting_payment' and payment_due_at < now using FOR UPDATE SKIP LOCKED.
   * For each, transitions to 'cancelled', which releases inventory reservation and cancels payment.
   */
  async expireUnpaidOrders(
    now: Date = new Date(),
    options: { batchSize?: number } = {}
  ): Promise<{ processed: number; cancelled: string[]; errors: { id: string; error: string }[] }> {
    const batchSize = Math.min(200, Math.max(1, options.batchSize ?? 100));
    const systemAdmin: AdminContext = {
      id: "system",
      userId: "system",
      name: "System Automation",
      role: "super_admin",
      email: "system@scrubx.pk",
    };

    const expiredOrders = await db
      .select({ id: orders.id, orderNumber: orders.orderNumber })
      .from(orders)
      .where(
        and(
          eq(orders.status, "awaiting_payment"),
          lt(orders.paymentDueAt, now)
        )
      )
      .limit(batchSize)
      .for("update", { skipLocked: true });

    const cancelled: string[] = [];
    const errors: { id: string; error: string }[] = [];

    for (const order of expiredOrders) {
      try {
        await this.updateOrderStatus(
          {
            orderId: order.id,
            status: "cancelled",
            note: "Payment window expired (automatically cancelled by system).",
          },
          systemAdmin
        );
        cancelled.push(order.orderNumber);
      } catch (err: any) {
        errors.push({ id: order.id, error: err.message || "Failed to expire order" });
      }
    }

    return {
      processed: expiredOrders.length,
      cancelled,
      errors,
    };
  }

  /**
   * ECOM-002: Requests an order return (RMA) with selected line items.
   */
  async requestReturn(
    input: RequestOrderReturnInput,
    admin: AdminContext
  ) {
    assertRole(admin, ["staff"]);

    const orderBundle = await this.orderRepo.findById(input.orderId);
    if (!orderBundle) {
      throw new NotFoundError("Order", input.orderId);
    }
    if (orderBundle.status === "cancelled") {
      throw new ValidationError("Cannot request a return for a cancelled order.");
    }

    // Validate returned line items
    const orderItemsMap = new Map(orderBundle.items.map((i) => [i.id, i]));
    for (const retItem of input.items) {
      const orderItem = orderItemsMap.get(retItem.orderItemId);
      if (!orderItem) {
        throw new ValidationError(`Order item ${retItem.orderItemId} does not belong to order ${orderBundle.orderNumber}.`);
      }
      if (retItem.quantity > orderItem.quantity) {
        throw new ValidationError(`Return quantity (${retItem.quantity}) exceeds ordered quantity (${orderItem.quantity}) for ${orderItem.productName}.`);
      }
    }

    return this.orderRepo.createReturnBundle({
      orderId: input.orderId,
      reason: input.reason,
      notes: input.notes,
      requestedBy: admin.userId || (admin as any).id,
      items: input.items,
    });
  }

  /**
   * ECOM-002: Approves an order return.
   */
  async approveReturn(
    input: ApproveOrderReturnInput,
    admin: AdminContext
  ) {
    assertRole(admin, ["admin"]);

    const ret = await this.orderRepo.findReturnById(input.returnId);
    if (!ret) {
      throw new NotFoundError("Return", input.returnId);
    }
    if (ret.status !== "requested") {
      throw new ValidationError(`Return is already '${ret.status}' and cannot be approved.`);
    }

    return this.orderRepo.updateReturn(input.returnId, {
      status: "approved",
      approvedBy: admin.userId || (admin as any).id,
    });
  }

  /**
   * ECOM-002: Receives returned items at the warehouse, restocking eligible items.
   */
  async receiveReturn(
    input: ReceiveOrderReturnInput,
    admin: AdminContext
  ) {
    assertRole(admin, ["admin"]);

    const ret = await this.orderRepo.findReturnById(input.returnId);
    if (!ret) {
      throw new NotFoundError("Return", input.returnId);
    }
    if (ret.status !== "approved") {
      throw new ValidationError(`Return must be approved before receiving (currently '${ret.status}').`);
    }

    const orderBundle = await this.orderRepo.findById(ret.orderId);
    const orderItemMap = new Map((orderBundle?.items || []).map((i) => [i.id, i]));

    return db.transaction(async (tx) => {
      // Restock items in inventory
      for (const retItem of ret.items) {
        const orderItem = orderItemMap.get(retItem.orderItemId);
        if (orderItem?.variantId && retItem.restock) {
          await this.invService.returnOrderStock(
            orderItem.variantId,
            retItem.quantity,
            ret.orderId,
            admin.userId || (admin as any).id,
            tx
          );
        }
      }

      return this.orderRepo.updateReturn(
        input.returnId,
        {
          status: "received",
          receivedAt: new Date(),
        },
        tx
      );
    });
  }

  /**
   * ECOM-002: Completes the return, optionally issuing a refund.
   */
  async completeReturn(
    input: CompleteOrderReturnInput,
    admin: AdminContext
  ) {
    assertRole(admin, ["admin"]);

    const ret = await this.orderRepo.findReturnById(input.returnId);
    if (!ret) {
      throw new NotFoundError("Return", input.returnId);
    }
    if (ret.status !== "received") {
      throw new ValidationError(`Return must be received before completing (currently '${ret.status}').`);
    }

    return this.orderRepo.updateReturn(input.returnId, {
      status: "completed",
      refundAmount: input.refundAmount ? input.refundAmount.toFixed(2) : ret.refundAmount,
    });
  }

  /**
   * ECOM-003: Product Exchange flow (Return + Linked Replacement Reservation).
   */
  async createExchange(
    input: CreateOrderExchangeInput,
    admin: AdminContext
  ) {
    assertRole(admin, ["admin"]);

    const orderBundle = await this.orderRepo.findById(input.orderId);
    if (!orderBundle) {
      throw new NotFoundError("Order", input.orderId);
    }

    return db.transaction(async (tx) => {
      // 1. Create Return for the exchange item
      const { returnRecord } = await this.orderRepo.createReturnBundle(
        {
          orderId: input.orderId,
          reason: `Exchange: ${input.reason}`,
          requestedBy: admin.userId || (admin as any).id,
          items: input.returnItems.map((i) => ({ ...i, restock: true })),
        },
        tx
      );

      // 2. Reserve stock for the replacement variant
      await this.invService.reserveStock(
        input.replacementVariantId,
        input.replacementQuantity,
        undefined,
        tx
      );

      // 3. Link replacement details to return
      const updatedReturn = await this.orderRepo.updateReturn(
        returnRecord.id,
        {
          notes: `Exchange for variant ${input.replacementVariantId} (Qty: ${input.replacementQuantity})`,
        },
        tx
      );

      return {
        returnRecord: updatedReturn,
        exchangeDetails: {
          originalOrderId: input.orderId,
          returnId: returnRecord.id,
          replacementVariantId: input.replacementVariantId,
          quantity: input.replacementQuantity,
        },
      };
    });
  }

  /**
   * ECOM-002: Gets all returns for a given order.
   */
  async getOrderReturns(orderId: string, admin: AdminContext) {
    assertRole(admin, ["staff"]);
    return this.orderRepo.findReturnsByOrderId(orderId);
  }
}

export const orderService = new OrderService();
