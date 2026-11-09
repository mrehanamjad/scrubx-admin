import type { OrderStatus, PaymentMethodId, ProductColor } from "./types";

export const COLOR_LIBRARY: ProductColor[] = [
  { id: "col-teal", name: "Peacock Teal", hex: "#0F766E" },
  { id: "col-navy", name: "Midnight Navy", hex: "#1E293B" },
  { id: "col-black", name: "Jet Black", hex: "#111827" },
  { id: "col-olive", name: "Army Olive", hex: "#4D5D45" },
  { id: "col-white", name: "Optic White", hex: "#F7F8FA" },
  { id: "col-burgundy", name: "Burgundy", hex: "#6B1F35" },
  { id: "col-sky", name: "Sky Blue", hex: "#7FB2D9" },
  { id: "col-pink", name: "Blush Pink", hex: "#E4B7B7" },
  { id: "col-sage", name: "Sage", hex: "#9BB39B" },
  { id: "col-grey", name: "Heather Grey", hex: "#9CA3AF" },
  { id: "col-charcoal", name: "Charcoal", hex: "#3F4652" },
  { id: "col-sand", name: "Sand Beige", hex: "#D6C3A5" },
];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending (COD)",
  awaiting_payment: "Awaiting Payment",
  payment_submitted: "Payment Submitted",
  pending_cod: "Pending (COD)",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const ORDER_STATUS_ORDER: OrderStatus[] = [
  "awaiting_payment",
  "payment_submitted",
  "pending_cod",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethodId, string> = {
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  sadapay: "SadaPay",
  nayapay: "NayaPay",
  bank: "Bank Transfer",
  cod: "Cash on Delivery",
};
