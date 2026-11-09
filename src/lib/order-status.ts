/**
 * Canonical Order Status FSM (Finite State Machine)
 *
 * ARCH-005: Single authoritative source of truth for order statuses,
 * display labels, and valid status transitions across server and client.
 */

export const ORDER_STATUSES = [
  "pending", // Cash on Delivery
  "awaiting_payment",
  "payment_submitted",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Valid state transitions for orders.
 * Terminal states (cancelled, refunded) have zero outbound transitions.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  awaiting_payment: ["payment_submitted", "confirmed", "cancelled"],
  payment_submitted: ["confirmed", "awaiting_payment", "cancelled"],
  confirmed: ["processing", "cancelled", "awaiting_payment"], // awaiting_payment for administrative payment reversal (BUG-011)
  processing: ["shipped", "cancelled", "awaiting_payment"], // awaiting_payment for administrative payment reversal (BUG-011)
  shipped: ["delivered", "cancelled", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

/**
 * Normalizes legacy client aliases (e.g. pending_cod -> pending)
 */
export function normalizeOrderStatus(status: string): OrderStatus {
  if (status === "pending_cod") return "pending";
  return status as OrderStatus;
}

/**
 * Check if transitioning from one status to another is permitted by the FSM.
 */
export function canTransition(from: string, to: string): boolean {
  const normFrom = normalizeOrderStatus(from);
  const normTo = normalizeOrderStatus(to);
  const allowed = ALLOWED_STATUS_TRANSITIONS[normFrom];
  return allowed ? allowed.includes(normTo) : false;
}

/**
 * Get all possible next statuses for an order in a given state.
 */
export function nextStatuses(from: string): readonly OrderStatus[] {
  const normFrom = normalizeOrderStatus(from);
  return ALLOWED_STATUS_TRANSITIONS[normFrom] || [];
}

/**
 * Human-readable order status labels.
 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending (COD)",
  awaiting_payment: "Awaiting Payment",
  payment_submitted: "Payment Submitted",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};
