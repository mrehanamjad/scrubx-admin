import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";
import type { OrderStatus, PaymentStatus, ProductStatus } from "../../lib/types";
import { ORDER_STATUS_LABEL } from "../../lib/constants";

const orderVariant: Record<OrderStatus, "neutral" | "brand" | "navy" | "success" | "warning" | "danger" | "info" | "purple"> = {
  pending: "purple",
  awaiting_payment: "warning",
  payment_submitted: "info",
  pending_cod: "purple",
  confirmed: "brand",
  processing: "navy",
  shipped: "info",
  delivered: "success",
  cancelled: "neutral",
  refunded: "danger",
};

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  return (
    <Badge variant={orderVariant[status]} className={className}>
      {ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}

const paymentVariant: Record<PaymentStatus, "neutral" | "brand" | "navy" | "success" | "warning" | "danger" | "info" | "purple"> = {
  pending: "warning",
  submitted: "info",
  approved: "success",
  rejected: "danger",
  refunded: "purple",
  failed: "danger",
};

export function PaymentStatusBadge({
  status,
  className,
}: {
  status: PaymentStatus;
  className?: string;
}) {
  const label: Record<PaymentStatus, string> = {
    pending: "Pending",
    submitted: "Submitted",
    approved: "Approved",
    rejected: "Rejected",
    refunded: "Refunded",
    failed: "Failed",
  };
  return (
    <Badge variant={paymentVariant[status]} className={className}>
      {label[status]}
    </Badge>
  );
}

export function ProductStatusBadge({
  status,
  className,
}: {
  status: ProductStatus;
  className?: string;
}) {
  const map = {
    draft: { variant: "warning" as const, label: "Draft" },
    active: { variant: "success" as const, label: "Active" },
    archived: { variant: "navy" as const, label: "Archived" },
  };
  return (
    <Badge variant={map[status].variant} className={className}>
      {map[status].label}
    </Badge>
  );
}

export function StockBadge({
  stock,
  reorderLevel,
  className,
}: {
  stock: number;
  reorderLevel: number;
  className?: string;
}) {
  if (stock === 0)
    return (
      <Badge variant="danger" className={className}>
        Out of stock
      </Badge>
    );
  if (stock <= reorderLevel)
    return (
      <Badge variant="warning" className={className}>
        Low stock
      </Badge>
    );
  return (
    <Badge variant="success" className={cn("bg-emerald-50", className)}>
      In stock
    </Badge>
  );
}
