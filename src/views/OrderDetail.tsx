'use client';

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  MapPin,
  MessageSquare,
  Package,
  PenTool,
  Phone,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  Truck,
  User,
  XCircle,
  AlertCircle,
  Clock,
  CheckSquare,
  Printer,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input, Textarea } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { PageHeader } from "../components/shared/page-header";
import { Avatar, ProductThumb } from "../components/shared/thumb";
import { OrderStatusBadge, PaymentStatusBadge } from "../components/shared/status-badges";
import { EmptyState } from "../components/shared/empty-state";
import { useToast } from "../components/ui/toast";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "../lib/constants";
import { formatDate, formatDateTime, formatPKR } from "../lib/format";
import { cn } from "../lib/utils";
import type { Order, OrderStatus } from "../lib/types";
import {
  updateOrderStatusAction,
  updateOrderShippingAction,
  addOrderNoteAction,
  requestOrderReturnAction,
  approveOrderReturnAction,
  receiveOrderReturnAction,
  completeOrderReturnAction,
  createOrderExchangeAction,
  getOrderReturnsAction,
} from "../actions/orders";
import {
  approvePaymentAction,
  rejectPaymentAction,
  refundPaymentAction,
  markOrderPaymentPaidAction,
  markOrderPaymentPendingAction,
} from "../actions/payments";

const COURIERS = [
  "TCS Express",
  "Leopards Courier",
  "M&P",
  "CallCourier",
  "Pakistan Post",
  "Trax",
  "Rider",
];

// Courier Tracking URL generators
function getCourierTrackingUrl(courier: string, trackingNumber: string): string | null {
  if (!trackingNumber) return null;
  const cleanTracking = trackingNumber.trim();
  const lower = courier.toLowerCase();
  if (lower.includes("tcs")) {
    return `https://www.tcsexpress.com/tracking?tracking_no=${encodeURIComponent(cleanTracking)}`;
  }
  if (lower.includes("leopard")) {
    return `https://track.leopardscourier.com/?track_no=${encodeURIComponent(cleanTracking)}`;
  }
  if (lower.includes("m&p") || lower.includes("mnp")) {
    return `https://mulphilog.com/tracking?consignment=${encodeURIComponent(cleanTracking)}`;
  }
  if (lower.includes("callcourier")) {
    return `https://callcourier.com.pk/tracking/?tc=${encodeURIComponent(cleanTracking)}`;
  }
  if (lower.includes("pakistan post")) {
    return `https://ep.gov.pk/`;
  }
  if (lower.includes("trax")) {
    return `https://trax.pk/tracking/?tracking_number=${encodeURIComponent(cleanTracking)}`;
  }
  return null;
}

// Allowed Next Order Lifecycle Transitions
const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  awaiting_payment: ["confirmed", "cancelled"],
  payment_submitted: ["confirmed", "awaiting_payment", "cancelled"],
  pending_cod: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

const ORDER_LIFECYCLE_STEPS: Array<{ key: OrderStatus; label: string }> = [
  { key: "confirmed", label: "Confirmed" },
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
];

interface OrderDetailProps {
  id?: string;
  initialOrder?: Order;
  initialReturns?: any[];
}

export default function OrderDetailPage({
  id: propId,
  initialOrder,
  initialReturns,
}: OrderDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const order = initialOrder;

  // Notes & Courier State
  const [note, setNote] = useState("");
  const [courier, setCourier] = useState(order?.courier ?? "TCS Express");
  const [tracking, setTracking] = useState(order?.trackingNumber ?? "");
  const [markShippedOnSave, setMarkShippedOnSave] = useState(false);

  // Returns & Exchanges State (ECOM-002, ECOM-003)
  const [orderReturns, setOrderReturns] = useState<any[]>(initialReturns || []);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [exchangeModalOpen, setExchangeModalOpen] = useState(false);
  const [selectedReturnItems, setSelectedReturnItems] = useState<Record<string, { quantity: number; restock: boolean }>>({});
  const [returnReason, setReturnReason] = useState("Defective / Sizing Issue");
  const [returnNotes, setReturnNotes] = useState("");
  const [exchangeItemId, setExchangeItemId] = useState(order?.items[0]?.id || "");
  const [exchangeReplacementVariantId, setExchangeReplacementVariantId] = useState("");
  const [exchangeQuantity, setExchangeQuantity] = useState(1);
  const [exchangeReason, setExchangeReason] = useState("Exchange for different size");
  const [completeReturnModalOpen, setCompleteReturnModalOpen] = useState(false);
  const [activeReturnForCompletion, setActiveReturnForCompletion] = useState<any | null>(null);
  const [completionRefundAmount, setCompletionRefundAmount] = useState("");
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);

  // Modals & Dialogs State
  const [proofOpen, setProofOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("Transaction ID not found in bank statement");
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState(order?.total ? String(order.total) : "0");
  const [refundReason, setRefundReason] = useState("Customer requested cancellation");
  const [markPaidModalOpen, setMarkPaidModalOpen] = useState(false);
  const [paidTid, setPaidTid] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Submitting States
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [isSubmittingShipping, setIsSubmittingShipping] = useState(false);
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);

  if (!order) {
    return (
      <EmptyState
        title="Order not found"
        description="This order may have been removed or does not exist."
        action={
          <Button asChild>
            <Link href="/orders">Back to orders</Link>
          </Button>
        }
      />
    );
  }

  const totals = [
    { label: "Subtotal", value: order.subtotal },
    { label: "Engraving charges", value: order.engravingCharges },
    { label: "Discount", value: -order.discount },
    { label: "Shipping", value: order.shipping },
  ];

  // Helper for quick copy
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
    toast({ title: `Copied ${label} to clipboard` });
  };

  const refreshReturns = async () => {
    if (!order) return;
    try {
      const res = await getOrderReturnsAction({ orderId: order.id });
      if (res.success && res.data) {
        setOrderReturns(res.data);
      }
    } catch {
      // non-fatal
    }
  };

  const handleRequestReturn = async () => {
    if (!order) return;
    const items = Object.entries(selectedReturnItems)
      .filter(([_, v]) => v.quantity > 0)
      .map(([orderItemId, v]) => ({
        orderItemId,
        quantity: v.quantity,
        restock: v.restock,
      }));

    if (items.length === 0) {
      toast({ title: "No items selected", description: "Select at least one item to return.", variant: "error" });
      return;
    }

    setIsSubmittingReturn(true);
    try {
      const res = await requestOrderReturnAction({
        orderId: order.id,
        reason: returnReason,
        notes: returnNotes || undefined,
        items,
      });

      if (res.success) {
        toast({ title: "Return requested successfully", description: "Return authorization (RMA) created." });
        setReturnModalOpen(false);
        setSelectedReturnItems({});
        await refreshReturns();
        router.refresh();
      } else {
        toast({ title: "Failed to request return", description: res.error, variant: "error" });
      }
    } catch (err: any) {
      toast({ title: "Error requesting return", description: err.message, variant: "error" });
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  const handleApproveReturn = async (returnId: string) => {
    setIsSubmittingReturn(true);
    try {
      const res = await approveOrderReturnAction({ returnId });
      if (res.success) {
        toast({ title: "Return approved", description: "Awaiting customer shipment / warehouse receipt." });
        await refreshReturns();
        router.refresh();
      } else {
        toast({ title: "Failed to approve return", description: res.error, variant: "error" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "error" });
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  const handleReceiveReturn = async (returnId: string) => {
    setIsSubmittingReturn(true);
    try {
      const res = await receiveOrderReturnAction({ returnId });
      if (res.success) {
        toast({ title: "Return received", description: "Eligible items restocked in warehouse inventory." });
        await refreshReturns();
        router.refresh();
      } else {
        toast({ title: "Failed to receive return", description: res.error, variant: "error" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "error" });
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  const handleCompleteReturn = async () => {
    if (!activeReturnForCompletion) return;
    setIsSubmittingReturn(true);
    try {
      const refundAmt = completionRefundAmount ? parseFloat(completionRefundAmount) : undefined;
      const res = await completeOrderReturnAction({
        returnId: activeReturnForCompletion.id,
        refundAmount: refundAmt,
      });
      if (res.success) {
        toast({ title: "Return completed", description: "Return completed and financial records reconciled." });
        setCompleteReturnModalOpen(false);
        setActiveReturnForCompletion(null);
        await refreshReturns();
        router.refresh();
      } else {
        toast({ title: "Failed to complete return", description: res.error, variant: "error" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "error" });
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  const handleCreateExchange = async () => {
    if (!order || !exchangeItemId || !exchangeReplacementVariantId) {
      toast({ title: "Missing fields", description: "Please select an item and replacement variant.", variant: "error" });
      return;
    }
    setIsSubmittingReturn(true);
    try {
      const res = await createOrderExchangeAction({
        orderId: order.id,
        reason: exchangeReason,
        returnItems: [{ orderItemId: exchangeItemId, quantity: exchangeQuantity }],
        replacementVariantId: exchangeReplacementVariantId,
        replacementQuantity: exchangeQuantity,
      });

      if (res.success) {
        toast({ title: "Exchange created", description: "Return created and replacement inventory reserved." });
        setExchangeModalOpen(false);
        await refreshReturns();
        router.refresh();
      } else {
        toast({ title: "Failed to create exchange", description: res.error, variant: "error" });
      }
    } catch (err: any) {
      toast({ title: "Error creating exchange", description: err.message, variant: "error" });
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  // 1. ORDER LIFECYCLE HANDLERS
  const handleStatusChange = async (value: OrderStatus, customNote?: string) => {
    setIsSubmittingStatus(true);
    try {
      const dbStatus = value === "pending_cod" ? "pending" : value;
      const res = await updateOrderStatusAction({
        orderId: order.id,
        status: dbStatus as any,
        note: customNote || undefined,
      });

      if (res.success) {
        toast({
          title: "Order status updated",
          description: `${order.orderNumber} is now ${ORDER_STATUS_LABEL[value]}.`,
        });
        setCancelModalOpen(false);
        setCancelReason("");
        router.refresh();
      } else {
        toast({
          title: "Failed to update order status",
          description: res.error || "Transition not permitted.",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error updating status",
        description: err.message,
        variant: "error",
      });
    } finally {
      setIsSubmittingStatus(false);
    }
  };

  // 2. PAYMENT MANAGEMENT HANDLERS
  const handleApprovePayment = async () => {
    setIsSubmittingPayment(true);
    try {
      if (order.paymentId) {
        const res = await approvePaymentAction({
          paymentId: order.paymentId,
          action: "approve",
        });
        if (res.success) {
          toast({
            title: "Payment Approved",
            description: `Payment for ${order.orderNumber} is verified. Order moved to Confirmed.`,
          });
          setProofOpen(false);
          router.refresh();
        } else {
          toast({
            title: "Approval Failed",
            description: res.error || "Could not approve payment.",
            variant: "error",
          });
        }
      } else {
        // Fallback for orders without an existing payment row
        const res = await markOrderPaymentPaidAction({
          orderId: order.id,
          note: "Marked as paid by admin.",
        });
        if (res.success) {
          toast({
            title: "Payment Marked as Paid",
            description: `Order ${order.orderNumber} has been confirmed.`,
          });
          setProofOpen(false);
          router.refresh();
        } else {
          toast({
            title: "Payment Update Failed",
            description: res.error || "Could not update payment.",
            variant: "error",
          });
        }
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "error",
      });
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleRejectPayment = async () => {
    if (!rejectionReason.trim()) {
      toast({ title: "Please specify a rejection reason", variant: "error" });
      return;
    }

    setIsSubmittingPayment(true);
    try {
      if (order.paymentId) {
        const res = await rejectPaymentAction({
          paymentId: order.paymentId,
          action: "reject",
          rejectionReason: rejectionReason.trim(),
        });

        if (res.success) {
          toast({
            title: "Payment Rejected",
            description: `Payment rejected. Order reverted to Awaiting Payment.`,
          });
          setRejectModalOpen(false);
          setProofOpen(false);
          router.refresh();
        } else {
          toast({
            title: "Rejection Failed",
            description: res.error || "Could not reject payment.",
            variant: "error",
          });
        }
      } else {
        toast({
          title: "Payment Record Not Found",
          description: "Cannot reject an unrecorded payment.",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "error",
      });
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleRefundPayment = async () => {
    const num = Number(refundAmount);
    if (isNaN(num) || num <= 0) {
      toast({ title: "Please enter a valid refund amount", variant: "error" });
      return;
    }

    setIsSubmittingPayment(true);
    try {
      if (order.paymentId) {
        const fullReason = refundReason.trim()
          ? `${refundReason.trim()} (Amount: PKR ${num})`
          : `Amount: PKR ${num}`;

        const res = await refundPaymentAction({
          paymentId: order.paymentId,
          refundAmount: num,
          reason: fullReason,
          restock: true,
        });

        if (res.success) {
          toast({
            title: "Refund Processed",
            description: `Refund of ${formatPKR(num)} recorded for ${order.orderNumber}.`,
          });
          setRefundModalOpen(false);
          router.refresh();
        } else {
          toast({
            title: "Refund Failed",
            description: res.error || "Could not process refund.",
            variant: "error",
          });
        }
      } else {
        toast({
          title: "No Payment Record",
          description: "No registered payment row found to refund.",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "error",
      });
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleMarkAsPaidManual = async () => {
    setIsSubmittingPayment(true);
    try {
      const res = await markOrderPaymentPaidAction({
        orderId: order.id,
        paymentId: order.paymentId || undefined,
        transactionReference: paidTid.trim() || undefined,
        note: `Payment of ${formatPKR(order.total)} confirmed manually by admin.`,
      });

      if (res.success) {
        toast({
          title: "Payment Recorded",
          description: `Payment marked as Paid for ${order.orderNumber}.`,
        });
        setMarkPaidModalOpen(false);
        setPaidTid("");
        router.refresh();
      } else {
        toast({
          title: "Failed to record payment",
          description: res.error || "Could not update payment.",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "error",
      });
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleMarkAsUnpaid = async () => {
    setIsSubmittingPayment(true);
    try {
      const res = await markOrderPaymentPendingAction({
        orderId: order.id,
        paymentId: order.paymentId || undefined,
        note: "Payment status reset to pending by admin.",
      });

      if (res.success) {
        toast({
          title: "Payment Reset",
          description: `Payment status reset to Pending / Unpaid.`,
        });
        router.refresh();
      } else {
        toast({
          title: "Failed to reset payment",
          description: res.error || "Could not reset payment.",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "error",
      });
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // 3. SHIPPING & COURIER HANDLERS
  const handleSaveShipping = async () => {
    setIsSubmittingShipping(true);
    try {
      const res = await updateOrderShippingAction({
        orderId: order.id,
        courier: courier,
        trackingNumber: tracking.trim(),
      });

      if (res.success && markShippedOnSave && order.status === "processing") {
        await updateOrderStatusAction({
          orderId: order.id,
          status: "shipped",
          note: `Shipped via ${courier} (${tracking.trim()})`,
        });
      }

      if (res.success) {
        toast({
          title: "Courier details updated",
          description: `${courier} · ${tracking || "no tracking number"}`,
        });
        router.refresh();
      } else {
        toast({
          title: "Failed to update shipping",
          description: res.error || "Could not save shipping information.",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error updating shipping",
        description: err.message,
        variant: "error",
      });
    } finally {
      setIsSubmittingShipping(false);
    }
  };

  // 4. INTERNAL NOTE HANDLER
  const handleAddNote = async () => {
    if (!note.trim()) return;
    setIsSubmittingNote(true);
    try {
      const res = await addOrderNoteAction({
        orderId: order.id,
        body: note.trim(),
      });

      if (res.success) {
        toast({ title: "Note added" });
        setNote("");
        router.refresh();
      } else {
        toast({
          title: "Failed to add note",
          description: res.error || "Could not save note.",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error adding note",
        description: err.message,
        variant: "error",
      });
    } finally {
      setIsSubmittingNote(false);
    }
  };

  // Pakistani WhatsApp Direct URL
  const cleanPhone = order.customerPhone.replace(/[^0-9]/g, "");
  const waPhone = cleanPhone.startsWith("0")
    ? `92${cleanPhone.slice(1)}`
    : cleanPhone.startsWith("92")
    ? cleanPhone
    : `92${cleanPhone}`;
  const whatsappUrl = `https://wa.me/${waPhone}?text=Hi%20${encodeURIComponent(
    order.customerName
  )}%2C%20this%20is%20ScrubX%20Pakistan%20regarding%20your%20order%20${encodeURIComponent(
    order.orderNumber
  )}.`;

  const trackingUrl = getCourierTrackingUrl(courier, tracking);

  // Stepper calculations
  const isCancelled = order.status === "cancelled";
  const isRefunded = order.status === "refunded";
  const stepIndex = ORDER_LIFECYCLE_STEPS.findIndex((s) => s.key === order.status);
  const activeStepIdx = stepIndex >= 0 ? stepIndex : order.status === "pending_cod" || order.status === "awaiting_payment" ? -1 : 0;

  return (
    <div className="space-y-6">
      {/* 1. TOP PAGE HEADER */}
      <PageHeader
        eyebrow={
          <Link href="/orders" className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-brand-800 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Orders
          </Link>
        }
        title={
          <div className="flex items-center gap-3">
            <span>{order.orderNumber}</span>
            <button
              onClick={() => handleCopy(order.orderNumber, "Order Number")}
              className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors"
              title="Copy Order Number"
            >
              {copiedField === "Order Number" ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        }
        description={`Placed ${formatDate(order.date)} at ${formatDateTime(order.date).split("at")[1] || ""} · ${order.items.length} line item${order.items.length === 1 ? "" : "s"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href={`/orders/${order.id}/print?doc=invoice`}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-surface-muted transition-colors shadow-2xs"
              title="Print Tax Invoice"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Print</span> Invoice
            </Link>
            <Link
              href={`/orders/${order.id}/print?doc=packing-slip`}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-surface-muted transition-colors shadow-2xs"
              title="Print Packing Slip"
            >
              <Package className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Packing</span> Slip
            </Link>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 shadow-2xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                Order:
              </span>
              <OrderStatusBadge status={order.status} />
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 shadow-2xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                Payment:
              </span>
              <PaymentStatusBadge status={order.paymentStatus} />
            </div>
          </div>
        }
      />

      {/* 2. INDEPENDENT ORDER MANAGEMENT CONTROL BAR */}
      <Card className="border-line bg-surface shadow-2xs">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: Section Identity & Lifecycle Stepper */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-brand-700" />
                <h3 className="text-sm font-semibold text-ink">Order Fulfilment Lifecycle</h3>
                <span className="text-xs text-ink-muted">— Independent from payment status</span>
              </div>

              {/* Visual Step Progress */}
              {isCancelled ? (
                <div className="flex items-center gap-2 rounded-md bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 border border-rose-200">
                  <XCircle className="h-4 w-4 shrink-0" />
                  <span>This order has been cancelled. Allocated stock has been restored to warehouse inventory.</span>
                </div>
              ) : isRefunded ? (
                <div className="flex items-center gap-2 rounded-md bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 border border-purple-200">
                  <RotateCcw className="h-4 w-4 shrink-0" />
                  <span>This order has been completed and refunded.</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-xs">
                  {ORDER_LIFECYCLE_STEPS.map((step, idx) => {
                    const isCompleted = activeStepIdx >= idx;
                    const isCurrent = activeStepIdx === idx;
                    return (
                      <div key={step.key} className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "flex h-5 items-center justify-center rounded-full px-2 text-[11px] font-semibold tracking-wide transition-colors",
                            isCurrent
                              ? "bg-brand-600 text-white shadow-2xs"
                              : isCompleted
                              ? "bg-brand-50 text-brand-800 border border-brand-200 font-medium"
                              : "bg-surface-muted text-ink-muted"
                          )}
                        >
                          {isCompleted && !isCurrent ? (
                            <Check className="mr-1 h-3 w-3 stroke-[3]" />
                          ) : null}
                          {step.label}
                        </span>
                        {idx < ORDER_LIFECYCLE_STEPS.length - 1 && (
                          <span
                            className={cn(
                              "h-0.5 w-3 sm:w-6 rounded",
                              activeStepIdx > idx ? "bg-brand-500" : "bg-line"
                            )}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Order Status Management Controls */}
            {!isCancelled && !isRefunded && (
              <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-line lg:border-t-0 lg:pt-0">
                <span className="text-xs font-medium text-ink-muted">Set Status:</span>
                <Select
                  value={order.status}
                  disabled={isSubmittingStatus}
                  onValueChange={(val) => {
                    if (val === "cancelled") {
                      setCancelModalOpen(true);
                    } else {
                      handleStatusChange(val as OrderStatus);
                    }
                  }}
                >
                  <SelectTrigger className="w-[180px] bg-canvas text-xs font-medium shadow-2xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      [
                        "confirmed",
                        "processing",
                        "shipped",
                        "delivered",
                        "cancelled",
                      ] as OrderStatus[]
                    ).map((statusKey) => (
                      <SelectItem
                        key={statusKey}
                        value={statusKey}
                        className={cn(statusKey === "cancelled" && "text-rose-600")}
                      >
                        {ORDER_STATUS_LABEL[statusKey]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Quick Next-Action Buttons */}
                {order.status === "confirmed" && (
                  <Button
                    size="sm"
                    variant="default"
                    disabled={isSubmittingStatus}
                    onClick={() => handleStatusChange("processing")}
                  >
                    Start Processing
                  </Button>
                )}
                {order.status === "processing" && (
                  <Button
                    size="sm"
                    variant="default"
                    disabled={isSubmittingStatus}
                    onClick={() => handleStatusChange("shipped")}
                  >
                    <Truck className="h-3.5 w-3.5 mr-1" />
                    Mark as Shipped
                  </Button>
                )}
                {order.status === "shipped" && (
                  <Button
                    size="sm"
                    variant="default"
                    disabled={isSubmittingStatus}
                    onClick={() => handleStatusChange("delivered")}
                  >
                    <CheckSquare className="h-3.5 w-3.5 mr-1" />
                    Mark as Delivered
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 border-rose-200"
                  disabled={isSubmittingStatus}
                  onClick={() => setCancelModalOpen(true)}
                >
                  Cancel Order
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 3. MAIN CONTENT GRID */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* LEFT COLUMN: Order Items, Engraving, Independent Payment Card, Internal Notes */}
        <div className="space-y-6">
          {/* Order Items Table */}
          <Card className="border-line shadow-2xs">
            <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-brand-700" />
                <h2 className="text-[15px] font-semibold text-ink">Order Items</h2>
              </div>
              <Badge variant="neutral">
                {order.items.reduce((sum, i) => sum + i.quantity, 0)} units
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Variant & Size</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <ProductThumb src={item.image} alt={item.productName} />
                          <div className="min-w-0">
                            <Link
                              href={`/products/${item.productId}/edit`}
                              className="block max-w-[220px] truncate text-[13px] font-medium text-ink hover:text-brand-700"
                            >
                              {item.productName}
                            </Link>
                            {item.engraving && (
                              <Badge variant="purple" className="mt-1">
                                <PenTool className="h-3 w-3 mr-1" />
                                {item.engraving.type === "logo" ? "Logo Engraved" : "Name Engraved"}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="block text-ink text-xs font-medium">{item.colorName || "Standard"}</span>
                        <span className="text-[11.5px] text-ink-muted">Size {item.size || "M"}</span>
                      </TableCell>
                      <TableCell className="font-mono text-[12px] text-ink-soft">{item.sku}</TableCell>
                      <TableCell className="text-right tabular text-xs">{formatPKR(item.price)}</TableCell>
                      <TableCell className="text-right tabular font-medium text-xs">{item.quantity}</TableCell>
                      <TableCell className="text-right font-semibold text-ink tabular text-xs">
                        {formatPKR(item.price * item.quantity)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Personalisation details if engraved */}
          {order.items.some((i) => i.engraving) && (
            <Card className="border-purple-200 bg-purple-50/20 shadow-2xs">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <PenTool className="h-4 w-4 text-purple-700" />
                  <h2 className="text-[15px] font-semibold text-ink">Personalisation & Embroidery Details</h2>
                </div>
                <p className="text-[12.5px] text-ink-muted">
                  Custom name or logo artwork guidelines specified for this order.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {order.items
                  .filter((i) => i.engraving)
                  .map((item) => {
                    const eng = item.engraving!;
                    return (
                      <div
                        key={item.id}
                        className="rounded-lg border border-purple-200/80 bg-white p-3.5 shadow-2xs"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-[13px] font-semibold text-ink">
                              {item.productName} · {item.variantName}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                              <Badge variant="purple">
                                {eng.type === "logo" ? "Logo Engraving" : "Name Engraving"}
                              </Badge>
                              <span className="font-medium text-ink">
                                {eng.text ? `“${eng.text}”` : "Vector artwork uploaded"}
                              </span>
                            </div>
                            {eng.logoUrl && (
                              <div className="pt-2">
                                <a
                                  href={eng.logoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-700 hover:underline"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  View / Download Artwork Vector
                                </a>
                              </div>
                            )}
                          </div>
                          <span className="text-[13px] font-semibold text-ink tabular">
                            {formatPKR(eng.price)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </CardContent>
            </Card>
          )}

          {/* Returns & Exchanges (RMA) Card */}
          <Card className="border-line shadow-2xs">
            <CardHeader className="flex-row items-center justify-between gap-3 border-b border-line pb-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-brand-700" />
                  <h2 className="text-[15px] font-semibold text-ink">Returns & Exchanges (RMA)</h2>
                </div>
                <p className="text-[12.5px] text-ink-muted">
                  Process reverse logistics, inspect returned items, and trigger automated stock restock.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const initialSelections: Record<string, { quantity: number; restock: boolean }> = {};
                    order.items.forEach((item) => {
                      initialSelections[item.id] = { quantity: item.quantity, restock: true };
                    });
                    setSelectedReturnItems(initialSelections);
                    setReturnModalOpen(true);
                  }}
                  disabled={isCancelled}
                  className="h-8 gap-1.5 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Request Return
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setExchangeItemId(order.items[0]?.id || "");
                    setExchangeModalOpen(true);
                  }}
                  disabled={isCancelled}
                  className="h-8 gap-1.5 text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Request Exchange
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              {orderReturns.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line p-6 text-center text-xs text-ink-muted">
                  No return or exchange requests have been initiated for this order.
                </div>
              ) : (
                <div className="space-y-3">
                  {orderReturns.map((ret) => (
                    <div
                      key={ret.id}
                      className="rounded-lg border border-line bg-surface p-4 shadow-2xs space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-ink">
                            RMA-{ret.id.slice(0, 8).toUpperCase()}
                          </span>
                          <Badge
                            variant={
                              ret.status === "completed"
                                ? "success"
                                : ret.status === "received"
                                ? "brand"
                                : ret.status === "approved"
                                ? "purple"
                                : ret.status === "rejected"
                                ? "danger"
                                : "outline"
                            }
                          >
                            {ret.status.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {ret.status === "requested" && (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-xs bg-brand-700 hover:bg-brand-800"
                              onClick={() => handleApproveReturn(ret.id)}
                              disabled={isSubmittingReturn}
                            >
                              Approve Return
                            </Button>
                          )}
                          {ret.status === "approved" && (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-xs bg-indigo-700 hover:bg-indigo-800"
                              onClick={() => handleReceiveReturn(ret.id)}
                              disabled={isSubmittingReturn}
                            >
                              Receive & Restock
                            </Button>
                          )}
                          {ret.status === "received" && (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800"
                              onClick={() => {
                                setActiveReturnForCompletion(ret);
                                setCompletionRefundAmount(ret.refundAmount ? String(ret.refundAmount) : "");
                                setCompleteReturnModalOpen(true);
                              }}
                              disabled={isSubmittingReturn}
                            >
                              Complete Return
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-2 text-xs sm:grid-cols-2">
                        <div>
                          <span className="text-ink-muted">Reason:</span>{" "}
                          <span className="font-medium text-ink">{ret.reason}</span>
                        </div>
                        {ret.refundAmount && (
                          <div>
                            <span className="text-ink-muted">Refund Amount:</span>{" "}
                            <span className="font-bold text-ink font-mono">{formatPKR(Number(ret.refundAmount))}</span>
                          </div>
                        )}
                        {ret.notes && (
                          <div className="col-span-2 text-[12px] text-ink-soft bg-surface-muted/50 p-2 rounded border border-line">
                            {ret.notes}
                          </div>
                        )}
                      </div>

                      {ret.items && ret.items.length > 0 && (
                        <div className="rounded border border-line/70 bg-surface-muted/30 p-2.5 text-xs">
                          <p className="font-semibold text-ink-soft mb-1.5 text-[11px] uppercase tracking-wider">Returned Items:</p>
                          <div className="space-y-1">
                            {ret.items.map((it: any) => {
                              const orderItem = order.items.find((oi) => oi.id === it.orderItemId);
                              return (
                                <div key={it.id} className="flex items-center justify-between text-ink">
                                  <span>
                                    {orderItem ? `${orderItem.productName} (${orderItem.colorName || "Standard"}, ${orderItem.size || "M"})` : `Item ${it.orderItemId}`}
                                  </span>
                                  <span className="font-medium">
                                    Qty: {it.quantity} {it.restock ? "(Restocked)" : "(Damaged / Discarded)"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 4. INDEPENDENT PAYMENT MANAGEMENT CARD */}
          <Card className="border-line shadow-2xs">
            <CardHeader className="flex-row items-center justify-between gap-3 border-b border-line pb-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-brand-700" />
                  <h2 className="text-[15px] font-semibold text-ink">Payment Management</h2>
                </div>
                <p className="text-[12.5px] text-ink-muted">
                  Verification, payment proof review, and refund management.
                </p>
              </div>
              <PaymentStatusBadge status={order.paymentStatus} />
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              {/* Financial Metrics Grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 rounded-lg bg-surface-muted/50 p-4 border border-line">
                <div>
                  <p className="text-[11.5px] font-medium text-ink-muted">Payment Method</p>
                  <p className="mt-1 text-[13px] font-semibold text-ink">
                    {order.paymentMethodName || PAYMENT_METHOD_LABEL[order.paymentMethod] || order.paymentMethod}
                  </p>
                </div>
                <div>
                  <p className="text-[11.5px] font-medium text-ink-muted">Amount Due</p>
                  <p className="mt-1 text-[13.5px] font-bold text-ink tabular">
                    {formatPKR(order.total)}
                  </p>
                </div>
                <div>
                  <p className="text-[11.5px] font-medium text-ink-muted">Transaction ID (TID)</p>
                  <div className="mt-1 flex items-center gap-1.5 font-mono text-[12.5px] text-ink font-semibold">
                    <span>{order.transactionRef || "—"}</span>
                    {order.transactionRef && (
                      <button
                        onClick={() => handleCopy(order.transactionRef!, "TID")}
                        className="rounded p-0.5 text-ink-muted hover:text-ink"
                        title="Copy TID"
                      >
                        {copiedField === "TID" ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[11.5px] font-medium text-ink-muted">Sender Account</p>
                  <p className="mt-1 text-[12.5px] text-ink-soft">
                    {order.senderName ? `${order.senderName} (${order.senderAccountLast4 || "****"})` : "—"}
                  </p>
                </div>
              </div>

              {/* Status Specific Action Panels */}
              {/* SCENARIO A: Payment Submitted / Awaiting Verification */}
              {order.paymentStatus === "submitted" && (
                <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <div className="mt-0.5 rounded-full bg-sky-100 p-1.5 text-sky-700">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-sky-950">Payment Proof Submitted</h4>
                        <p className="text-xs text-sky-800 mt-0.5">
                          The customer submitted a payment screenshot proof. Please verify the amount and TID in your mobile wallet / bank account before approving.
                        </p>
                      </div>
                    </div>
                    {order.proofUrl && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-white hover:bg-sky-50 border-sky-300 text-sky-800 shrink-0"
                        onClick={() => setProofOpen(true)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        View Proof
                      </Button>
                    )}
                  </div>

                  {order.proofUrl && (
                    <div className="flex items-center gap-3 pt-1">
                      <div
                        onClick={() => setProofOpen(true)}
                        className="relative h-16 w-16 cursor-pointer overflow-hidden rounded-lg border border-sky-300 bg-white shadow-2xs hover:opacity-90"
                      >
                        <Image
                          src={order.proofUrl}
                          alt="Screenshot Proof Thumbnail"
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div className="text-xs text-sky-900">
                        <p className="font-semibold">Screenshot Attached</p>
                        <p className="text-sky-700">Click to view high-resolution verification modal</p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 border-t border-sky-200 pt-3">
                    <Button
                      size="sm"
                      variant="default"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={isSubmittingPayment}
                      onClick={handleApprovePayment}
                    >
                      <BadgeCheck className="h-4 w-4 mr-1.5" />
                      Approve Payment (Mark Paid)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-rose-300 text-rose-700 hover:bg-rose-50"
                      disabled={isSubmittingPayment}
                      onClick={() => setRejectModalOpen(true)}
                    >
                      <XCircle className="h-4 w-4 mr-1.5" />
                      Reject Payment Proof
                    </Button>
                  </div>
                </div>
              )}

              {/* SCENARIO B: Payment Approved / Paid */}
              {order.paymentStatus === "approved" && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <div className="mt-0.5 rounded-full bg-emerald-100 p-1.5 text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-emerald-950">Payment Verified & Settled</h4>
                        <p className="text-xs text-emerald-800 mt-0.5">
                          {order.paidAt ? `Paid on ${formatDateTime(order.paidAt)}` : "Verified and recorded in full."}
                        </p>
                      </div>
                    </div>
                    {order.proofUrl && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-white hover:bg-emerald-50 border-emerald-300 text-emerald-800"
                        onClick={() => setProofOpen(true)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Proof Screenshot
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 border-t border-emerald-200 pt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-purple-300 text-purple-700 hover:bg-purple-50"
                      disabled={isSubmittingPayment}
                      onClick={() => {
                        setRefundAmount(String(order.total));
                        setRefundModalOpen(true);
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      Process Refund
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-ink-muted hover:text-ink text-xs"
                      disabled={isSubmittingPayment}
                      onClick={handleMarkAsUnpaid}
                    >
                      Reset to Unpaid
                    </Button>
                  </div>
                </div>
              )}

              {/* SCENARIO C: Payment Pending / Unpaid */}
              {order.paymentStatus === "pending" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <div className="mt-0.5 rounded-full bg-amber-100 p-1.5 text-amber-700">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-amber-950">
                          {order.paymentMethod === "cod" ? "Cash on Delivery" : "Awaiting Payment"}
                        </h4>
                        <p className="text-xs text-amber-800 mt-0.5">
                          {order.paymentMethod === "cod"
                            ? `The delivery courier will collect ${formatPKR(order.total)} in cash upon delivery.`
                            : "Customer has placed the order and is pending proof submission for JazzCash, EasyPaisa, or Bank Transfer."}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="default"
                      className="bg-brand-600 hover:bg-brand-700 text-white shrink-0"
                      disabled={isSubmittingPayment}
                      onClick={() => setMarkPaidModalOpen(true)}
                    >
                      <BadgeCheck className="h-3.5 w-3.5 mr-1.5" />
                      Mark as Paid
                    </Button>
                  </div>
                </div>
              )}

              {/* SCENARIO D: Payment Rejected */}
              {order.paymentStatus === "rejected" && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 space-y-3">
                  <div className="flex gap-3">
                    <div className="mt-0.5 rounded-full bg-rose-100 p-1.5 text-rose-700">
                      <ShieldAlert className="h-4 w-4" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-rose-950">Payment Proof Rejected</h4>
                      <p className="text-xs text-rose-800">
                        Reason: {order.rejectionReason || "Transaction could not be verified in store account."}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 border-t border-rose-200 pt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      disabled={isSubmittingPayment}
                      onClick={handleApprovePayment}
                    >
                      Re-approve Payment
                    </Button>
                    {order.proofUrl && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs"
                        onClick={() => setProofOpen(true)}
                      >
                        Inspect Proof
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* SCENARIO E: Payment Refunded */}
              {order.paymentStatus === "refunded" && (
                <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-4">
                  <div className="flex gap-3">
                    <div className="mt-0.5 rounded-full bg-purple-100 p-1.5 text-purple-700">
                      <RotateCcw className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-purple-950">Payment Refunded</h4>
                      <p className="text-xs text-purple-800 mt-0.5">
                        A full or partial monetary refund has been settled and audited for this order.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Internal Notes Card */}
          <Card className="border-line shadow-2xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-brand-700" />
                <h2 className="text-[15px] font-semibold text-ink">Internal Notes & Team Audit</h2>
              </div>
              <p className="text-[12.5px] text-ink-muted">
                Only visible to ScrubX internal staff — never shared with customers.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {order.internalNotes.length === 0 ? (
                <p className="text-[13px] text-ink-muted italic">No internal notes on this order yet.</p>
              ) : (
                <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                  {order.internalNotes.map((item) => (
                    <div key={item.id} className="rounded-lg border border-line bg-surface-muted/50 p-3 space-y-1">
                      <p className="text-[13px] text-ink leading-relaxed">{item.text}</p>
                      <p className="text-[11.5px] text-ink-muted">
                        {item.by} · {formatDateTime(item.at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-2.5 sm:flex-row pt-2 border-t border-line">
                <Textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a private note regarding fulfilment, payment verification, or customer requests…"
                  className="flex-1 text-xs"
                />
                <Button
                  className="self-start sm:self-auto shrink-0"
                  disabled={!note.trim() || isSubmittingNote}
                  onClick={handleAddNote}
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  {isSubmittingNote ? "Adding..." : "Add Note"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: Order Summary, Customer Profile & WhatsApp, Courier & Shipping, Status Timeline */}
        <div className="space-y-6">
          {/* Order Summary & Pricing */}
          <Card className="border-line shadow-2xs">
            <CardHeader className="pb-3 border-b border-line">
              <h2 className="text-[15px] font-semibold text-ink">Order Financial Summary</h2>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-4">
              {totals.map((row) => (
                <div key={row.label} className="flex items-center justify-between text-[13px]">
                  <span className="text-ink-muted">{row.label}</span>
                  <span
                    className={cn(
                      "font-medium tabular",
                      row.label === "Discount" && row.value !== 0 ? "text-emerald-700" : "text-ink"
                    )}
                  >
                    {formatPKR(row.value)}
                  </span>
                </div>
              ))}
              <div className="mt-2 flex items-center justify-between border-t border-line pt-3">
                <span className="text-[14px] font-bold text-ink">Grand Total</span>
                <span className="text-[18px] font-bold text-ink tabular text-brand-700">
                  {formatPKR(order.total)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Customer Profile & Direct Contact */}
          <Card className="border-line shadow-2xs">
            <CardHeader className="pb-3 border-b border-line flex-row items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink">Customer Information</h2>
              {order.customerId && (
                <Link
                  href={`/customers/${order.customerId}`}
                  className="text-xs font-medium text-brand-700 hover:underline flex items-center gap-1"
                >
                  View Profile <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="flex items-center gap-3">
                <Avatar name={order.customerName} size="lg" />
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-ink">{order.customerName}</p>
                  <p className="text-[12px] text-ink-muted">
                    {order.customerType === "registered" ? "Registered Customer" : "Guest Checkout"}
                  </p>
                </div>
              </div>

              {/* Quick Communication Actions */}
              <div className="space-y-2 border-t border-line pt-3">
                <div className="flex items-center justify-between text-xs">
                  <a
                    href={`tel:${order.customerPhone.replace(/\s/g, "")}`}
                    className="flex items-center gap-2 text-ink-soft hover:text-brand-700"
                  >
                    <Phone className="h-3.5 w-3.5 text-ink-muted" />
                    {order.customerPhone || "No phone provided"}
                  </a>
                  {order.customerPhone && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                      title="Chat with customer on WhatsApp"
                    >
                      <MessageSquare className="h-3 w-3" />
                      WhatsApp
                    </a>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs">
                  <a
                    href={`mailto:${order.customerEmail}`}
                    className="flex items-center gap-2 break-all text-ink-soft hover:text-brand-700"
                  >
                    <User className="h-3.5 w-3.5 text-ink-muted" />
                    {order.customerEmail}
                  </a>
                  <button
                    onClick={() => handleCopy(order.customerEmail, "Email")}
                    className="text-ink-muted hover:text-ink text-[11px] p-0.5"
                  >
                    {copiedField === "Email" ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>

              {/* Delivery Address */}
              <div className="border-t border-line pt-3">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted uppercase tracking-wider">
                    <MapPin className="h-3.5 w-3.5 text-brand-600" />
                    Delivery Destination
                  </p>
                  <button
                    onClick={() => {
                      const fullAddr = `${order.shippingAddress.recipient}\n${order.shippingAddress.line1} ${order.shippingAddress.line2 || ""}\n${order.shippingAddress.city}, ${order.shippingAddress.province}\n${order.shippingAddress.phone}`;
                      handleCopy(fullAddr, "Address");
                    }}
                    className="text-[11px] text-brand-700 hover:underline inline-flex items-center gap-1"
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                </div>
                <div className="mt-1.5 text-[13px] leading-relaxed text-ink-soft bg-surface-muted/40 p-2.5 rounded-lg border border-line/60">
                  <p className="font-semibold text-ink">{order.shippingAddress.recipient}</p>
                  <p>{order.shippingAddress.line1}</p>
                  {order.shippingAddress.line2 && <p>{order.shippingAddress.line2}</p>}
                  <p className="font-medium text-ink">
                    {order.shippingAddress.city}, {order.shippingAddress.province}{" "}
                    {order.shippingAddress.postcode}
                  </p>
                  <p className="text-xs text-ink-muted mt-1">{order.shippingAddress.phone}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Courier & Tracking Card */}
          <Card className="border-line shadow-2xs">
            <CardHeader className="pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-brand-700" />
                <h2 className="text-[15px] font-semibold text-ink">Courier & Tracking</h2>
              </div>
            </CardHeader>
            <CardContent className="space-y-3.5 pt-4">
              <div>
                <Label className="text-xs font-semibold">Courier Partner</Label>
                <Select value={courier} onValueChange={setCourier}>
                  <SelectTrigger className="mt-1.5 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COURIERS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="tracking" className="text-xs font-semibold">
                    Consignment / Tracking Number
                  </Label>
                  {tracking && (
                    <button
                      onClick={() => handleCopy(tracking, "Tracking")}
                      className="text-[11px] text-brand-700 hover:underline flex items-center gap-1"
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </button>
                  )}
                </div>
                <Input
                  id="tracking"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  placeholder="e.g. 7729104820"
                  className="mt-1.5 font-mono text-xs"
                />
              </div>

              {order.status === "processing" && (
                <label className="flex items-center gap-2 text-xs text-ink cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={markShippedOnSave}
                    onChange={(e) => setMarkShippedOnSave(e.target.checked)}
                    className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500"
                  />
                  <span>Automatically advance order to <strong>Shipped</strong></span>
                </label>
              )}

              <Button
                className="w-full text-xs"
                variant="outline"
                disabled={isSubmittingShipping}
                onClick={handleSaveShipping}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {isSubmittingShipping ? "Saving..." : "Save Courier Details"}
              </Button>

              {trackingUrl && (
                <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center justify-center gap-1.5 w-full rounded-md bg-surface-muted py-2 text-xs font-medium text-brand-700 hover:bg-brand-50 hover:text-brand-800 transition-colors border border-line"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Track on {courier} Portal
                </a>
              )}
            </CardContent>
          </Card>

          {/* Status Timeline History */}
          <Card className="border-line shadow-2xs">
            <CardHeader className="pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-brand-700" />
                <h2 className="text-[15px] font-semibold text-ink">Status History Timeline</h2>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <ol className="relative space-y-4 border-l border-line pl-5">
                {[...order.timeline].reverse().map((event, index) => (
                  <li key={`${event.status}-${event.at}-${index}`} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-surface",
                        index === 0 ? "bg-brand-600" : "bg-ink-muted/50"
                      )}
                    />
                    <p className="text-[13px] font-medium text-ink">{event.label}</p>
                    <p className="text-[11.5px] text-ink-muted">
                      {formatDateTime(event.at)}
                      {event.by ? ` · by ${event.by}` : ""}
                    </p>
                    {event.note && (
                      <p className="mt-1 rounded border border-line bg-surface-muted/60 px-2 py-1 text-[12px] text-ink-soft">
                        {event.note}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 5. MODALS & DIALOGS                                      */}
      {/* ======================================================== */}

      {/* A. PAYMENT PROOF LIGHTBOX MODAL */}
      <Dialog open={proofOpen} onOpenChange={setProofOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Payment Screenshot Proof</DialogTitle>
            <DialogDescription>
              Uploaded by customer for Order {order.orderNumber}. Verify with your bank or wallet TID: <strong>{order.transactionRef || "N/A"}</strong>
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {order.proofUrl ? (
              <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl border border-line bg-black/5">
                <Image
                  src={order.proofUrl}
                  alt="Payment Proof Screenshot"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <p className="text-center text-sm text-ink-muted py-8">No image proof file attached.</p>
            )}

            <div className="rounded-lg bg-surface-muted p-3 text-xs flex justify-between items-center border border-line">
              <div>
                <span className="font-medium text-ink-muted">Claimed Transaction ID: </span>
                <span className="font-mono font-bold text-ink">{order.transactionRef || "Not provided"}</span>
              </div>
              {order.proofUrl && (
                <a
                  href={order.proofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 font-semibold hover:underline inline-flex items-center gap-1"
                >
                  Open Original <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </DialogBody>
          <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
            <Button
              variant="outline"
              className="text-rose-600 border-rose-300 hover:bg-rose-50"
              onClick={() => {
                setProofOpen(false);
                setRejectModalOpen(true);
              }}
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              Reject Proof
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setProofOpen(false)}>
                Close
              </Button>
              <Button
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleApprovePayment}
                disabled={isSubmittingPayment}
              >
                <BadgeCheck className="h-4 w-4 mr-1.5" />
                Approve Payment
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* B. REJECT PAYMENT DIALOG */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Reject Payment Proof
            </DialogTitle>
            <DialogDescription>
              Specify why this payment proof could not be verified. The order will be reverted to Awaiting Payment.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Common Rejection Reasons</Label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Transaction ID not found in bank statement",
                  "Payment amount does not match order total",
                  "Screenshot is unreadable or cropped",
                  "Duplicate transaction reference used",
                ].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setRejectionReason(reason)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-left text-xs transition-colors",
                      rejectionReason === reason
                        ? "border-rose-400 bg-rose-50 text-rose-800 font-medium"
                        : "border-line bg-surface text-ink-soft hover:bg-surface-muted"
                    )}
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rejectReasonText" className="text-xs font-semibold">
                Reason Details (Recorded in internal audit)
              </Label>
              <Textarea
                id="rejectReasonText"
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this payment proof was rejected…"
                className="text-xs"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-rose-600 hover:bg-rose-700 text-white"
              disabled={isSubmittingPayment || !rejectionReason.trim()}
              onClick={handleRejectPayment}
            >
              {isSubmittingPayment ? "Rejecting..." : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* C. PROCESS REFUND DIALOG */}
      <Dialog open={refundModalOpen} onOpenChange={setRefundModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-purple-800 flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Record Processed Refund
            </DialogTitle>
            <DialogDescription>
              Record a monetary refund that you have settled with the customer via bank transfer, JazzCash, or store reversal.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <Label htmlFor="refundAmountInput" className="text-xs font-semibold">
                Refund Amount (PKR)
              </Label>
              <Input
                id="refundAmountInput"
                type="number"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="mt-1.5 text-xs font-semibold"
              />
              <p className="mt-1 text-[11px] text-ink-muted">
                Order total is {formatPKR(order.total)}. Enter full or partial amount.
              </p>
            </div>

            <div>
              <Label htmlFor="refundReasonSelect" className="text-xs font-semibold">
                Refund Reason
              </Label>
              <Select value={refundReason} onValueChange={setRefundReason}>
                <SelectTrigger className="mt-1.5 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Customer requested cancellation">Customer requested cancellation</SelectItem>
                  <SelectItem value="Item out of stock / unable to fulfill">Item out of stock / unable to fulfill</SelectItem>
                  <SelectItem value="Damaged or defective goods returned">Damaged or defective goods returned</SelectItem>
                  <SelectItem value="Customer exchange or partial return">Customer exchange or partial return</SelectItem>
                  <SelectItem value="Other administrative adjustment">Other administrative adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRefundModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-purple-700 hover:bg-purple-800 text-white"
              disabled={isSubmittingPayment}
              onClick={handleRefundPayment}
            >
              {isSubmittingPayment ? "Processing..." : "Confirm Refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* D. CANCEL ORDER CONFIRMATION MODAL */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Cancel Order {order.orderNumber}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this order? This will release reserved inventory back to active stock.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div>
              <Label htmlFor="cancelReasonInput" className="text-xs font-semibold">
                Reason for cancellation (Optional note)
              </Label>
              <Textarea
                id="cancelReasonInput"
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Customer changed mind, unconfirmed COD address, duplicate order…"
                className="mt-1.5 text-xs"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelModalOpen(false)}>
              Keep Order Active
            </Button>
            <Button
              variant="default"
              className="bg-rose-600 hover:bg-rose-700 text-white"
              disabled={isSubmittingStatus}
              onClick={() => handleStatusChange("cancelled", cancelReason.trim())}
            >
              {isSubmittingStatus ? "Cancelling..." : "Confirm Cancellation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* E. MARK AS PAID MANUAL MODAL (FOR COD OR MANUAL BANK WIRES) */}
      <Dialog open={markPaidModalOpen} onOpenChange={setMarkPaidModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-emerald-800 flex items-center gap-2">
              <BadgeCheck className="h-5 w-5" />
              Mark Payment as Paid
            </DialogTitle>
            <DialogDescription>
              Confirm receipt of payment for Order {order.orderNumber} ({formatPKR(order.total)}).
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div>
              <Label htmlFor="paidTidInput" className="text-xs font-semibold">
                Transaction Reference / Receipt Number (Optional)
              </Label>
              <Input
                id="paidTidInput"
                value={paidTid}
                onChange={(e) => setPaidTid(e.target.value)}
                placeholder="e.g. COD-COLLECTED or Bank Ref #..."
                className="mt-1.5 text-xs font-mono"
              />
              <p className="mt-1 text-[11px] text-ink-muted">
                {order.paymentMethod === "cod"
                  ? "Enter courier delivery receipt number or leave blank."
                  : "Enter bank transaction reference if available."}
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMarkPaidModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={isSubmittingPayment}
              onClick={handleMarkAsPaidManual}
            >
              {isSubmittingPayment ? "Recording..." : "Confirm Paid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* F. REQUEST RETURN MODAL (ECOM-002) */}
      <Dialog open={returnModalOpen} onOpenChange={setReturnModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-brand-800 flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Request Return (RMA) — {order.orderNumber}
            </DialogTitle>
            <DialogDescription>
              Select line items to return, indicate quantities, and specify return reason.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Select Items to Return</Label>
              <div className="divide-y divide-line rounded-lg border border-line bg-surface p-2 space-y-2">
                {order.items.map((item) => {
                  const sel = selectedReturnItems[item.id] || { quantity: 0, restock: true };
                  const isChecked = sel.quantity > 0;
                  return (
                    <div key={item.id} className="pt-2 first:pt-0 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-ink">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              setSelectedReturnItems((prev) => ({
                                ...prev,
                                [item.id]: {
                                  quantity: e.target.checked ? item.quantity : 0,
                                  restock: prev[item.id]?.restock ?? true,
                                },
                              }));
                            }}
                            className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500"
                          />
                          <span>{item.productName} ({item.colorName || "Standard"}, Size {item.size || "M"})</span>
                        </label>
                        <span className="text-xs text-ink-muted">Ordered: {item.quantity}</span>
                      </div>
                      {isChecked && (
                        <div className="pl-6 flex items-center gap-4 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-ink-muted">Qty:</span>
                            <Input
                              type="number"
                              min={1}
                              max={item.quantity}
                              value={sel.quantity}
                              onChange={(e) => {
                                const val = Math.min(item.quantity, Math.max(1, parseInt(e.target.value) || 1));
                                setSelectedReturnItems((prev) => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], quantity: val },
                                }));
                              }}
                              className="h-7 w-16 text-center text-xs"
                            />
                          </div>
                          <label className="flex items-center gap-1.5 cursor-pointer text-ink-soft">
                            <input
                              type="checkbox"
                              checked={sel.restock}
                              onChange={(e) => {
                                setSelectedReturnItems((prev) => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], restock: e.target.checked },
                                }));
                              }}
                              className="h-3.5 w-3.5 rounded border-line"
                            />
                            Restock upon receipt
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="returnReasonSelect" className="text-xs font-semibold">
                Reason for Return
              </Label>
              <Select value={returnReason} onValueChange={setReturnReason}>
                <SelectTrigger id="returnReasonSelect" className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Defective / Sizing Issue">Defective / Sizing Issue</SelectItem>
                  <SelectItem value="Incorrect Item Shipped">Incorrect Item Shipped</SelectItem>
                  <SelectItem value="Damaged in Transit">Damaged in Transit</SelectItem>
                  <SelectItem value="Customer Dissatisfaction">Customer Dissatisfaction</SelectItem>
                  <SelectItem value="Exchange Required">Exchange Required</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="returnNotesInput" className="text-xs font-semibold">
                Internal Return Notes (Optional)
              </Label>
              <Textarea
                id="returnNotesInput"
                rows={2}
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Additional details regarding return condition or customer agreement…"
                className="text-xs"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReturnModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-brand-700 hover:bg-brand-800 text-white"
              disabled={isSubmittingReturn}
              onClick={handleRequestReturn}
            >
              {isSubmittingReturn ? "Creating..." : "Submit Return Authorization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* G. REQUEST EXCHANGE MODAL (ECOM-003) */}
      <Dialog open={exchangeModalOpen} onOpenChange={setExchangeModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-indigo-800 flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Request Product Exchange — {order.orderNumber}
            </DialogTitle>
            <DialogDescription>
              Select an item to return and specify the replacement variant to reserve.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="exchangeItemSelect" className="text-xs font-semibold">
                Item to Exchange
              </Label>
              <Select value={exchangeItemId} onValueChange={setExchangeItemId}>
                <SelectTrigger id="exchangeItemSelect" className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {order.items.map((it) => (
                    <SelectItem key={it.id} value={it.id}>
                      {it.productName} ({it.colorName || "Standard"}, {it.size || "M"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="replacementVariantInput" className="text-xs font-semibold">
                Replacement Variant UUID
              </Label>
              <Input
                id="replacementVariantInput"
                value={exchangeReplacementVariantId}
                onChange={(e) => setExchangeReplacementVariantId(e.target.value)}
                placeholder="e.g. 00000000-0000-0000-0000-000000000000"
                className="text-xs font-mono"
              />
              <p className="text-[11px] text-ink-muted">
                Enter the product variant UUID to reserve for the replacement.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exchangeQuantityInput" className="text-xs font-semibold">
                Replacement Quantity
              </Label>
              <Input
                id="exchangeQuantityInput"
                type="number"
                min={1}
                value={exchangeQuantity}
                onChange={(e) => setExchangeQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exchangeReasonInput" className="text-xs font-semibold">
                Exchange Reason
              </Label>
              <Input
                id="exchangeReasonInput"
                value={exchangeReason}
                onChange={(e) => setExchangeReason(e.target.value)}
                placeholder="e.g. Size exchange (Medium to Large)"
                className="text-xs"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExchangeModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-indigo-700 hover:bg-indigo-800 text-white"
              disabled={isSubmittingReturn || !exchangeReplacementVariantId.trim()}
              onClick={handleCreateExchange}
            >
              {isSubmittingReturn ? "Creating..." : "Confirm Exchange"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* H. COMPLETE RETURN MODAL */}
      <Dialog open={completeReturnModalOpen} onOpenChange={setCompleteReturnModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-emerald-800 flex items-center gap-2">
              <CheckSquare className="h-5 w-5" />
              Complete Return RMA
            </DialogTitle>
            <DialogDescription>
              Confirm completion of the return process and record optional refund issued.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div>
              <Label htmlFor="completionRefundInput" className="text-xs font-semibold">
                Refund Amount Settled (PKR, Optional)
              </Label>
              <Input
                id="completionRefundInput"
                type="number"
                step="0.01"
                value={completionRefundAmount}
                onChange={(e) => setCompletionRefundAmount(e.target.value)}
                placeholder="Leave blank if no refund issued"
                className="mt-1.5 text-xs font-mono"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCompleteReturnModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
              disabled={isSubmittingReturn}
              onClick={handleCompleteReturn}
            >
              {isSubmittingReturn ? "Completing..." : "Complete Return"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
