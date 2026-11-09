'use client';

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  PackagePlus,
  ShoppingBag,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { PageHeader } from "../components/shared/page-header";
import { ProductThumb } from "../components/shared/thumb";
import { OrderStatusBadge } from "../components/shared/status-badges";
import { Skeleton } from "../components/ui/skeleton";
import { formatDate, formatPKR } from "../lib/format";
import { cn } from "../lib/utils";
import type { Order, OrderStatus } from "../lib/types";

type Period = "7d" | "30d" | "90d" | "12m";

export interface DashboardProps {
  initialOrders?: Order[];
  initialMetrics?: {
    totalRevenue: number;
    totalOrders: number;
    pendingOrders: number;
    totalProducts: number;
    activeProducts: number;
    totalUnits: number;
    previousPeriodChange?: number;
  };
  initialPeriod?: Period;
  lowStockItems?: Array<{
    product: { id: string; name: string };
    variant: { id: string; name: string; sku: string; stock: number; reorderLevel: number; price: number };
  }>;
  chartData?: Array<{ label: string; revenue: number; orders: number }>;
  previousPeriod?: { currentTotal: number; previousTotal: number; change: number };
  statusBreakdown?: Array<{ status: OrderStatus; count: number; label: string; value: number }>;
  topProducts?: Array<{ id: string; name: string; units: number; revenue: number; image: string }>;
}

const PERIOD_LABEL: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "12m": "Last 12 months",
};

const STATUS_COLORS: Partial<Record<OrderStatus, string>> = {
  awaiting_payment: "#f59e0b",
  payment_submitted: "#38bdf8",
  pending_cod: "#a78bfa",
  confirmed: "#0e7c6b",
  processing: "#334155",
  shipped: "#2563eb",
  delivered: "#059669",
  cancelled: "#94a3b8",
  refunded: "#e11d48",
};

export default function Dashboard({
  initialOrders = [],
  initialMetrics,
  initialPeriod = "30d",
  lowStockItems = [],
  chartData: propChartData,
  previousPeriod: propPreviousPeriod,
  statusBreakdown: propStatusBreakdown,
  topProducts: propTopProducts,
}: DashboardProps = {}) {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const loading = false;
  const isRealData = Boolean(initialOrders.length > 0 || initialMetrics);

  useEffect(() => {
    setPeriod(initialPeriod);
  }, [initialPeriod]);

  const orders = initialOrders;
  const billable = orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded");

  const revenue = initialMetrics ? initialMetrics.totalRevenue : billable.reduce((sum, o) => sum + o.total, 0);
  const pendingOrders = initialMetrics
    ? initialMetrics.pendingOrders
    : orders.filter(
        (o) => o.status === "awaiting_payment" || o.status === "payment_submitted" || o.status === "pending_cod",
      ).length;
  const activeProducts = initialMetrics ? initialMetrics.activeProducts : 0;
  const totalUnits = initialMetrics ? initialMetrics.totalUnits : 0;
  const totalProductsCount = initialMetrics ? initialMetrics.totalProducts : 0;

  const fallbackPreviousPeriod = useMemo(() => {
    const now = Date.now();
    const ranges: Record<Period, number> = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 };
    const span = ranges[period];
    const current = billable.filter((o) => now - +new Date(o.date) <= span * 86400000);
    const currentTotal = current.reduce((sum, o) => sum + o.total, 0);
    const previous = billable.filter(
      (o) =>
        now - +new Date(o.date) > span * 86400000 && now - +new Date(o.date) <= span * 2 * 86400000,
    );
    const previousTotal = previous.reduce((sum, o) => sum + o.total, 0);
    const change = previousTotal === 0 ? (currentTotal > 0 ? 100 : 0) : ((currentTotal - previousTotal) / previousTotal) * 100;
    return { currentTotal, previousTotal, change };
  }, [billable, period]);

  const previousPeriod = propPreviousPeriod ?? fallbackPreviousPeriod;

  const fallbackChartData = useMemo(() => {
    const now = new Date();
    const buckets: { label: string; revenue: number; orders: number }[] = [];

    if (period === "7d" || period === "30d") {
      const days = period === "7d" ? 7 : 30;
      for (let i = days - 1; i >= 0; i -= 1) {
        const date = new Date(now);
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - i);
        const next = new Date(date);
        next.setDate(next.getDate() + 1);
        const inBucket = billable.filter((o) => {
          const t = +new Date(o.date);
          return t >= +date && t < +next;
        });
        buckets.push({
          label:
            period === "7d"
              ? date.toLocaleDateString("en-GB", { weekday: "short" })
              : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
          revenue: inBucket.reduce((sum, o) => sum + o.total, 0),
          orders: inBucket.length,
        });
      }
    } else if (period === "90d") {
      for (let i = 12; i >= 0; i -= 1) {
        const end = new Date(now);
        end.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() - i * 7);
        const start = new Date(end);
        start.setDate(start.getDate() - 6);
        const inBucket = billable.filter((o) => {
          const t = +new Date(o.date);
          return t >= +start && t <= +end;
        });
        buckets.push({
          label: start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
          revenue: inBucket.reduce((sum, o) => sum + o.total, 0),
          orders: inBucket.length,
        });
      }
    } else {
      for (let i = 11; i >= 0; i -= 1) {
        const date = new Date(now);
        date.setDate(1);
        date.setMonth(date.getMonth() - i);
        const year = date.getFullYear();
        const month = date.getMonth();
        const inBucket = billable.filter((o) => {
          const d = new Date(o.date);
          return d.getFullYear() === year && d.getMonth() === month;
        });
        buckets.push({
          label: date.toLocaleDateString("en-GB", { month: "short" }),
          revenue: inBucket.reduce((sum, o) => sum + o.total, 0),
          orders: inBucket.length,
        });
      }
    }
    return buckets;
  }, [billable, period]);

  const chartData = propChartData ?? fallbackChartData;

  const fallbackStatusBreakdown = useMemo(() => {
    const counts = new Map<OrderStatus, number>();
    orders.forEach((o) => counts.set(o.status, (counts.get(o.status) ?? 0) + 1));
    return [...counts.entries()]
      .map(([status, count]) => ({
        status,
        count,
        label: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        value: count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [orders]);

  const statusBreakdown = propStatusBreakdown ?? fallbackStatusBreakdown;

  const fallbackTopProducts = useMemo(() => {
    const map = new Map<string, { name: string; units: number; revenue: number; image: string }>();
    billable.forEach((order) =>
      order.items.forEach((item) => {
        const existing = map.get(item.productId) ?? {
          name: item.productName,
          units: 0,
          revenue: 0,
          image: item.image,
        };
        existing.units += item.quantity;
        existing.revenue += item.price * item.quantity;
        map.set(item.productId, existing);
      }),
    );
    return [...map.entries()]
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [billable]);

  const topProducts = propTopProducts ?? fallbackTopProducts;

  const lowStock = useMemo(() => {
    return lowStockItems.slice(0, 6);
  }, [lowStockItems]);

  const recentOrders = [...orders]
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .slice(0, 6);

  const stats = [
    {
      label: "Total revenue",
      value: formatPKR(revenue),
      hint: `${previousPeriod.change >= 0 ? "+" : ""}${previousPeriod.change.toFixed(1)}% vs previous ${PERIOD_LABEL[period].toLowerCase()}`,
      icon: CircleDollarSign,
      tone: "brand" as const,
      trend: previousPeriod.change >= 0,
    },
    {
      label: "Total orders",
      value: String(orders.length),
      hint: `${billable.length} completed or in progress`,
      icon: ShoppingBag,
      tone: "navy" as const,
    },
    {
      label: "Pending orders",
      value: String(pendingOrders),
      hint: "Awaiting payment or fulfilment",
      icon: ClipboardList,
      tone: "amber" as const,
    },
    {
      label: "Total products",
      value: String(totalProductsCount),
      hint: `${activeProducts} active · ${totalUnits} units in stock`,
      icon: Boxes,
      tone: "violet" as const,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Store overview"
        title="Dashboard"
        description="Live performance across orders, revenue and inventory for ScrubX Pakistan."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/orders">
                <ShoppingBag className="h-4 w-4" />
                View orders
              </Link>
            </Button>
            <Button asChild>
              <Link href="/products/new">
                <PackagePlus className="h-4 w-4" />
                Add product
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-ink-muted">{stat.label}</p>
                  {loading ? (
                    <Skeleton className="mt-2 h-7 w-28" />
                  ) : (
                    <p className="mt-1.5 text-[22px] font-semibold leading-none tracking-tight text-ink tabular">
                      {stat.value}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    stat.tone === "brand" && "bg-brand-50 text-brand-600",
                    stat.tone === "navy" && "bg-navy-50 text-navy-600",
                    stat.tone === "amber" && "bg-amber-50 text-amber-600",
                    stat.tone === "violet" && "bg-violet-50 text-violet-600",
                  )}
                >
                  <stat.icon className="h-4.5 w-4.5" />
                </span>
              </div>
              <p className="mt-3 flex items-center gap-1 text-[11.5px] text-ink-muted">
                {"trend" in stat && stat.trend !== undefined && (
                  <TrendingUp
                    className={cn(
                      "h-3.5 w-3.5",
                      stat.trend ? "text-emerald-600" : "text-rose-500",
                    )}
                  />
                )}
                {stat.hint}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Revenue</h2>
              <p className="text-[12.5px] text-ink-muted">
                {loading ? "Loading…" : formatPKR(previousPeriod.currentTotal)} in {PERIOD_LABEL[period].toLowerCase()}
              </p>
            </div>
            <div className="flex rounded-md border border-line bg-surface-muted p-0.5">
              {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPeriod(p);
                    if (isRealData) {
                      router.replace(`/?period=${p}`);
                    }
                  }}
                  className={cn(
                    "rounded px-2.5 py-1 text-[12px] font-medium transition-colors",
                    period === p
                      ? "bg-surface text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]"
                      : "text-ink-muted hover:text-ink-soft",
                  )}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="pl-1 pr-3">
            <div className="h-[268px] w-full">
              {loading ? (
                <div className="flex h-full items-end gap-2 px-4 pb-6">
                  {[40, 65, 30, 80, 55, 70, 45].map((h, i) => (
                    <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
                  ))}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0e7c6b" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#0e7c6b" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f3" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "#78839a" }}
                      minTickGap={16}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={52}
                      tick={{ fontSize: 11, fill: "#78839a" }}
                      tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : `${v}`)}
                    />
                    <Tooltip
                      cursor={{ stroke: "#cbd5e1", strokeDasharray: "4 4" }}
                      content={<ChartTooltip />}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#0e7c6b"
                      strokeWidth={2}
                      fill="url(#revenueFill)"
                      activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-[15px] font-semibold text-ink">Order status</h2>
            <p className="text-[12.5px] text-ink-muted">Breakdown of all {orders.length} orders</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="mx-auto h-[168px] w-[168px] rounded-full" />
            ) : (
              <div className="relative h-[168px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusBreakdown}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={52}
                      outerRadius={78}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {statusBreakdown.map((entry) => (
                        <Cell
                          key={entry.status}
                          fill={STATUS_COLORS[entry.status as OrderStatus] ?? "#94a3b8"}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[22px] font-semibold text-ink tabular">{orders.length}</span>
                  <span className="text-[11px] uppercase tracking-wider text-ink-muted">orders</span>
                </div>
              </div>
            )}
            <div className="mt-4 space-y-1.5">
              {statusBreakdown.map((entry) => (
                <div key={entry.status} className="flex items-center gap-2 text-[12.5px]">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: STATUS_COLORS[entry.status as OrderStatus] ?? "#94a3b8" }}
                  />
                  <span className="flex-1 truncate text-ink-soft">{entry.label}</span>
                  <span className="font-medium text-ink tabular">{entry.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-ink">Recent orders</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/orders">
                View all
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-mono text-[12.5px] font-medium text-brand-700 hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="text-ink">{order.customerName}</TableCell>
                      <TableCell>{formatDate(order.date)}</TableCell>
                      <TableCell className="font-medium text-ink tabular">
                        {formatPKR(order.total)}
                      </TableCell>
                      <TableCell>
                        <OrderStatusBadge status={order.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-ink">Top sellers</h2>
              <Badge variant="brand">By revenue</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
              ) : (
                topProducts.map((product) => (
                  <div key={product.id} className="flex items-center gap-3">
                    <ProductThumb src={product.image} alt={product.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{product.name}</p>
                      <p className="text-[11.5px] text-ink-muted">{product.units} units sold</p>
                    </div>
                    <span className="text-[13px] font-semibold text-ink tabular">
                      {formatPKR(product.revenue)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-ink">Low stock alerts</h2>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/inventory">Inventory</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {lowStock.length === 0 ? (
                <p className="text-[13px] text-ink-muted">All variants are above their reorder level.</p>
              ) : (
                lowStock.map(({ product, variant }) => (
                  <Link
                    key={variant.id}
                    href={`/inventory`}
                    className="flex items-center gap-3 rounded-md border border-amber-100 bg-amber-50/60 px-3 py-2 transition-colors hover:border-amber-200"
                  >
                    <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-ink">{product.name}</p>
                      <p className="truncate text-[11.5px] text-ink-muted">{variant.name}</p>
                    </div>
                    <Badge variant="warning">{variant.stock} left</Badge>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-[15px] font-semibold text-ink">Quick actions</h2>
          <p className="text-[12.5px] text-ink-muted">Common admin tasks, one click away.</p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/products/new", label: "Add new product", hint: "Create a listing with variants", icon: PackagePlus },
            { href: "/orders", label: "Review orders", hint: `${pendingOrders} orders need attention`, icon: ShoppingBag },
            { href: "/payments", label: "Verify payments", hint: "Approve or reject submissions", icon: CircleDollarSign },
            { href: "/inventory", label: "Adjust stock", hint: "Restock or correct inventory", icon: Boxes },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group flex items-start gap-3 rounded-lg border border-line bg-surface-muted/50 p-4 transition-all hover:border-brand-200 hover:bg-brand-50/50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface text-brand-600 ring-1 ring-line transition-colors group-hover:bg-brand-600 group-hover:text-white">
                <action.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-ink">{action.label}</span>
                <span className="mt-0.5 block text-[12px] text-ink-muted">{action.hint}</span>
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number; name?: string; payload?: { orders?: number } }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const value = Number(entry?.value ?? 0);
  const orders = entry?.payload?.orders;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-[0_8px_24px_-10px_rgba(13,20,36,0.3)]">
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="mt-0.5 text-[13px] font-semibold text-ink tabular">{formatPKR(value)}</p>
      {orders !== undefined && (
        <p className="text-[11.5px] text-ink-muted">
          {orders} order{orders === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}
