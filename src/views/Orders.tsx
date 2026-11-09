'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CircleDollarSign,
  ClipboardList,
  Filter,
  MoreHorizontal,
  SearchX,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Checkbox } from "../components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { PageHeader } from "../components/shared/page-header";
import { SearchInput } from "../components/shared/search-input";
import { EmptyState } from "../components/shared/empty-state";
import { Pagination } from "../components/shared/pagination";
import { Avatar } from "../components/shared/thumb";
import { OrderStatusBadge, PaymentStatusBadge } from "../components/shared/status-badges";
import { useToast } from "../components/ui/toast";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "../lib/constants";
import { formatDate, formatPKR } from "../lib/format";
import { cn } from "../lib/utils";
import type { Order, OrderStatus, PaymentMethodId, PaymentStatus } from "../lib/types";
import { updateOrderStatusAction, bulkUpdateOrderStatusAction } from "../actions/orders";

type SortKey = "newest" | "oldest" | "total-desc" | "total-asc";

interface OrdersProps {
  initialOrders?: Order[];
  initialPagination?: {
    totalItems: number;
    totalPages: number;
    currentPage: number;
    limit: number;
  };
  initialQuery?: string;
  deliveredThisMonthCount?: number;
}

export default function OrdersPage({
  initialOrders = [],
  initialPagination,
  initialQuery = "",
  deliveredThisMonthCount,
}: OrdersProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>(initialOrders);

  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const handleSearchSubmit = () => {
    const q = query.trim();
    router.replace(q ? `/orders?q=${encodeURIComponent(q)}` : "/orders");
  };
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const [status, setStatus] = useState<"all" | OrderStatus>("all");
  const [paymentStatus, setPaymentStatus] = useState<"all" | PaymentStatus>("all");
  const [method, setMethod] = useState<"all" | PaymentMethodId>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const toggleSelectOrder = (id: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (visibleItems: Order[]) => {
    const allSelected = visibleItems.length > 0 && visibleItems.every((o) => selectedOrderIds.includes(o.id));
    setSelectedOrderIds(allSelected ? [] : [...new Set([...selectedOrderIds, ...visibleItems.map((o) => o.id)])]);
  };

  const handleBulkStatus = async (newStatus: OrderStatus) => {
    if (selectedOrderIds.length === 0 || isBulkUpdating) return;
    setIsBulkUpdating(true);
    try {
      const res = await bulkUpdateOrderStatusAction({
        orderIds: selectedOrderIds.slice(0, 50),
        status: newStatus as any,
      });

      if (res.success && res.data) {
        const { succeeded, failed } = res.data;
        if (succeeded.length > 0) {
          toast({
            title: `Bulk update complete`,
            description: `${succeeded.length} order(s) updated to ${ORDER_STATUS_LABEL[newStatus] || newStatus}.${
              failed.length > 0 ? ` ${failed.length} failed.` : ""
            }`,
          });
        }
        if (failed.length > 0) {
          toast({
            title: `${failed.length} order(s) could not transition`,
            description: failed[0]?.error || "Invalid status transition.",
            variant: "error",
          });
        }
        setSelectedOrderIds([]);
        router.refresh();
      } else {
        toast({
          title: "Bulk update failed",
          description: res.error || "Failed to update orders.",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error in bulk update",
        description: err.message,
        variant: "error",
      });
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = orders.filter((order) => {
      const matchesQuery =
        !q ||
        order.orderNumber.toLowerCase().includes(q) ||
        order.customerName.toLowerCase().includes(q) ||
        order.customerPhone.includes(q) ||
        order.customerEmail.toLowerCase().includes(q) ||
        order.items.some((i) => i.productName.toLowerCase().includes(q));
      const matchesStatus = status === "all" || order.status === status;
      const matchesPayment =
        paymentStatus === "all" || order.paymentStatus === paymentStatus;
      const matchesMethod = method === "all" || order.paymentMethod === method;
      return matchesQuery && matchesStatus && matchesPayment && matchesMethod;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return +new Date(a.date) - +new Date(b.date);
        case "total-desc":
          return b.total - a.total;
        case "total-asc":
          return a.total - b.total;
        default:
          return +new Date(b.date) - +new Date(a.date);
      }
    });
    return sorted;
  }, [orders, query, status, paymentStatus, method, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const stats = [
    {
      label: "All orders",
      value: orders.length,
      icon: ShoppingBag,
      tone: "navy",
    },
    {
      label: "Needs action",
      value: orders.filter(
        (o) =>
          o.status === "awaiting_payment" ||
          o.status === "payment_submitted" ||
          o.status === "pending_cod",
      ).length,
      icon: ClipboardList,
      tone: "amber",
    },
    {
      label: "In fulfilment",
      value: orders.filter(
        (o) => o.status === "confirmed" || o.status === "processing" || o.status === "shipped",
      ).length,
      icon: Truck,
      tone: "brand",
    },
    {
      label: "Revenue",
      value: formatPKR(
        orders
          .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
          .reduce((sum, o) => sum + o.total, 0),
      ),
      icon: CircleDollarSign,
      tone: "violet",
    },
  ];

  const statusOptions: OrderStatus[] = [
    "awaiting_payment",
    "payment_submitted",
    "pending_cod",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ];

  const handleUpdateStatus = async (orderId: string, orderNumber: string, option: OrderStatus) => {
    try {
      const dbStatus = option === "pending_cod" ? "pending" : option;
      const res = await updateOrderStatusAction({ orderId, status: dbStatus as any });
      if (res.success) {
        toast({
          title: `Order moved to ${ORDER_STATUS_LABEL[option]}`,
          description: `${orderNumber} updated.`,
        });
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
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Orders"
        description="Review inbound orders, manage payment proofs and push shipments out for delivery."
        actions={
          <Badge variant="neutral">
            {deliveredThisMonthCount !== undefined ? deliveredThisMonthCount : orders.filter((o) => o.status === "delivered").length} delivered this month
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-start justify-between p-4">
              <div>
                <p className="text-[12px] font-medium text-ink-muted">{stat.label}</p>
                <p className="mt-1.5 text-[20px] font-semibold leading-none text-ink tabular">
                  {stat.value}
                </p>
              </div>
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg",
                  stat.tone === "navy" && "bg-navy-50 text-navy-600",
                  stat.tone === "amber" && "bg-amber-50 text-amber-600",
                  stat.tone === "brand" && "bg-brand-50 text-brand-600",
                  stat.tone === "violet" && "bg-violet-50 text-violet-600",
                )}
              >
                <stat.icon className="h-4.5 w-4.5" />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
            <SearchInput
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              onSubmit={handleSearchSubmit}
              placeholder="Search by order #, customer, phone, item…"
              className="w-full lg:max-w-xs"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value as "all" | OrderStatus);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="All order statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {ORDER_STATUS_LABEL[opt]}
                    </SelectItem>
                  ))}
                  <SelectItem value="refunded">Refunded</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={paymentStatus}
                onValueChange={(value) => {
                  setPaymentStatus(value as "all" | PaymentStatus);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Payment status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payments</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={method}
                onValueChange={(value) => {
                  setMethod(value as "all" | PaymentMethodId);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All methods</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                  <SelectItem value="jazzcash">JazzCash</SelectItem>
                  <SelectItem value="easypaisa">Easypaisa</SelectItem>
                  <SelectItem value="sadapay">SadaPay</SelectItem>
                  <SelectItem value="nayapay">NayaPay</SelectItem>
                  <SelectItem value="cod">Cash on Delivery</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={sort}
                onValueChange={(value) => setSort(value as SortKey)}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="total-desc">Amount: high to low</SelectItem>
                  <SelectItem value="total-asc">Amount: low to high</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedOrderIds.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 shadow-2xs ml-auto">
                <span className="text-xs font-semibold text-brand-800">
                  {selectedOrderIds.length} selected
                </span>
                <div className="h-4 w-px bg-brand-200" />
                <Select
                  onValueChange={(val) => handleBulkStatus(val as OrderStatus)}
                  disabled={isBulkUpdating}
                >
                  <SelectTrigger className="h-7 w-36 text-xs bg-white">
                    <SelectValue placeholder="Advance status…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="processing">Mark Processing</SelectItem>
                    <SelectItem value="shipped">Mark Shipped</SelectItem>
                    <SelectItem value="delivered">Mark Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancel Selected</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedOrderIds([])}
                  className="h-7 text-xs text-ink-muted hover:text-ink px-2"
                >
                  Deselect
                </Button>
              </div>
            )}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              className="m-4"
              icon={<SearchX className="h-5 w-5" />}
              title="No orders found"
              description="Try adjusting your filter or search query."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                    setPaymentStatus("all");
                    setMethod("all");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={visible.length > 0 && visible.every((o) => selectedOrderIds.includes(o.id))}
                        onCheckedChange={() => toggleSelectAll(visible)}
                        aria-label="Select all visible orders"
                      />
                    </TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="w-10">
                        <Checkbox
                          checked={selectedOrderIds.includes(order.id)}
                          onCheckedChange={() => toggleSelectOrder(order.id)}
                          aria-label={`Select order ${order.orderNumber}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-mono text-[13px] font-semibold text-brand-700 hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                        <p className="mt-0.5 text-[11.5px] text-ink-muted">
                          {PAYMENT_METHOD_LABEL[order.paymentMethod] || order.paymentMethod}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={order.customerName} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-ink">
                              {order.customerName}
                            </p>
                            <p className="truncate text-[11.5px] text-ink-muted">
                              {order.shippingAddress.city}
                              {order.customerType === "guest" && " · Guest"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(order.date)}</TableCell>
                      <TableCell className="text-right tabular">
                        {order.itemsCount ?? order.items.reduce((sum, i) => sum + i.quantity, 0)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-ink tabular">
                        {formatPKR(order.total)}
                      </TableCell>
                      <TableCell>
                        <PaymentStatusBadge status={order.paymentStatus} />
                      </TableCell>
                      <TableCell>
                        <OrderStatusBadge status={order.status} />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="Order actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
                            <DropdownMenuItem asChild>
                              <Link href={`/orders/${order.id}`}>
                                <ArrowUpRight className="h-3.5 w-3.5" />
                                Open order
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {statusOptions.map((option) => (
                              <DropdownMenuItem
                                key={option}
                                onClick={() => handleUpdateStatus(order.id, order.orderNumber, option)}
                              >
                                Mark as {ORDER_STATUS_LABEL[option]}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={initialPagination ? initialPagination.currentPage : safePage}
                pageSize={initialPagination ? initialPagination.limit : pageSize}
                total={initialPagination ? initialPagination.totalItems : filtered.length}
                onPageChange={(newPage) => {
                  setPage(newPage);
                  if (initialPagination) {
                    router.push(`?page=${newPage}&limit=${pageSize}`);
                  }
                }}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                  if (initialPagination) {
                    router.push(`?page=1&limit=${size}`);
                  }
                }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
