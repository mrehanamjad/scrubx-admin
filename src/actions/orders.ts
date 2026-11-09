"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSafeAction } from "../server/action-client.ts";
import { orderService } from "../server/services/order.service.ts";
import {
  createOrderSchema,
  updateOrderStatusSchema,
  bulkUpdateOrderStatusSchema,
  updateOrderShippingSchema,
  addOrderNoteSchema,
  requestOrderReturnSchema,
  approveOrderReturnSchema,
  receiveOrderReturnSchema,
  completeOrderReturnSchema,
  createOrderExchangeSchema,
} from "../server/validation/orders.ts";
import { uuidSchema } from "../server/validation/common.ts";

/**
 * Server Action: Create order bundle with item snapshots, stock reservation, and trigger guards.
 * Requires at least staff privileges.
 */
export const createOrderAction = createSafeAction(
  {
    schema: createOrderSchema,
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    const order = await orderService.createOrder(input, admin);
    revalidatePath("/orders");
    revalidatePath("/inventory");
    revalidatePath("/");
    return order;
  }
);

/**
 * Server Action: Update order status with state machine transition checks and inventory sync.
 * Strictly requires administrator privileges.
 */
export const updateOrderStatusAction = createSafeAction(
  {
    schema: updateOrderStatusSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await orderService.updateOrderStatus(input, admin);
    revalidatePath("/orders");
    revalidatePath(`/orders/${input.orderId}`);
    revalidatePath("/inventory");
    revalidatePath("/payments");
    return updated;
  }
);

/**
 * Server Action: Bulk update order status with per-order isolation (ECOM-009).
 * Strictly requires administrator privileges.
 */
export const bulkUpdateOrderStatusAction = createSafeAction(
  {
    schema: bulkUpdateOrderStatusSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const succeeded: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const orderId of input.orderIds) {
      try {
        await orderService.updateOrderStatus(
          {
            orderId,
            status: input.status,
            note: input.note,
          },
          admin
        );
        succeeded.push(orderId);
      } catch (err: any) {
        failed.push({ id: orderId, error: err.message || "Failed to update order status" });
      }
    }

    revalidatePath("/orders");
    revalidatePath("/inventory");
    revalidatePath("/payments");
    return { succeeded, failed };
  }
);

/**
 * Server Action: Update order courier and tracking information.
 * Requires at least staff privileges.
 */
export const updateOrderShippingAction = createSafeAction(
  {
    schema: updateOrderShippingSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await orderService.updateOrderShipping(input, admin);
    revalidatePath("/orders");
    revalidatePath(`/orders/${input.orderId}`);
    return updated;
  }
);

/**
 * Server Action: Append internal team note to order.
 * Requires at least staff privileges.
 */
export const addOrderNoteAction = createSafeAction(
  {
    schema: addOrderNoteSchema,
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    const note = await orderService.addOrderNote(input, admin);
    revalidatePath(`/orders/${input.orderId}`);
    return note;
  }
);

/**
 * Server Action: Request order return (ECOM-002).
 * Requires staff privileges.
 */
export const requestOrderReturnAction = createSafeAction(
  {
    schema: requestOrderReturnSchema,
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    const result = await orderService.requestReturn(input, admin);
    revalidatePath("/orders");
    revalidatePath(`/orders/${input.orderId}`);
    return result;
  }
);

/**
 * Server Action: Approve order return (ECOM-002).
 * Strictly requires admin privileges.
 */
export const approveOrderReturnAction = createSafeAction(
  {
    schema: approveOrderReturnSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const result = await orderService.approveReturn(input, admin);
    revalidatePath("/orders");
    return result;
  }
);

/**
 * Server Action: Receive returned order items and restock (ECOM-002).
 * Strictly requires admin privileges.
 */
export const receiveOrderReturnAction = createSafeAction(
  {
    schema: receiveOrderReturnSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const result = await orderService.receiveReturn(input, admin);
    revalidatePath("/orders");
    revalidatePath("/inventory");
    return result;
  }
);

/**
 * Server Action: Complete order return (ECOM-002).
 * Strictly requires admin privileges.
 */
export const completeOrderReturnAction = createSafeAction(
  {
    schema: completeOrderReturnSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const result = await orderService.completeReturn(input, admin);
    revalidatePath("/orders");
    revalidatePath("/payments");
    return result;
  }
);

/**
 * Server Action: Create order exchange (ECOM-003).
 * Strictly requires admin privileges.
 */
export const createOrderExchangeAction = createSafeAction(
  {
    schema: createOrderExchangeSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const result = await orderService.createExchange(input, admin);
    revalidatePath("/orders");
    revalidatePath(`/orders/${input.orderId}`);
    revalidatePath("/inventory");
    return result;
  }
);

/**
 * Server Action: Get returns for an order (ECOM-002).
 * Requires staff privileges.
 */
export const getOrderReturnsAction = createSafeAction(
  {
    schema: z.object({ orderId: uuidSchema }),
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    return orderService.getOrderReturns(input.orderId, admin);
  }
);
