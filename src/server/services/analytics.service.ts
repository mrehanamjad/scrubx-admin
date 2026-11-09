import { sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { assertRole } from "../auth.ts";
import type { AdminContext } from "../types.ts";
import type { OrderStatus } from "../../lib/types.ts";
import { STORE_TIMEZONE } from "../../lib/time.ts";

export type DashboardPeriod = "7d" | "30d" | "90d" | "12m";

export interface PeriodComparison {
  currentTotal: number;
  previousTotal: number;
  change: number;
}

export interface ChartBucket {
  label: string;
  revenue: number;
  orders: number;
}

export interface StatusBreakdownItem {
  status: OrderStatus;
  count: number;
  label: string;
  value: number;
}

export interface TopProductItem {
  id: string;
  name: string;
  units: number;
  revenue: number;
  image: string;
}

export interface DashboardAnalytics {
  metrics: {
    totalRevenue: number;
    totalOrders: number;
    pendingOrders: number;
    totalProducts: number;
    activeProducts: number;
    previousPeriodChange: number;
  };
  previousPeriod: PeriodComparison;
  chartData: ChartBucket[];
  statusBreakdown: StatusBreakdownItem[];
  topProducts: TopProductItem[];
}

export class AnalyticsService {
  /**
   * Retrieves comprehensive server-side analytics for the dashboard in Asia/Karachi timezone.
   * Strictly enforces staff authorization.
   */
  async getDashboardAnalytics(
    period: DashboardPeriod = "30d",
    admin: AdminContext
  ): Promise<DashboardAnalytics> {
    assertRole(admin, ["staff"]);

    // 1. Period intervals
    let granularity: "day" | "week" | "month" = "day";
    let currentInterval = "interval '30 days'";
    let prevInterval = "interval '60 days'";

    switch (period) {
      case "7d":
        granularity = "day";
        currentInterval = "interval '7 days'";
        prevInterval = "interval '14 days'";
        break;
      case "30d":
        granularity = "day";
        currentInterval = "interval '30 days'";
        prevInterval = "interval '60 days'";
        break;
      case "90d":
        granularity = "week";
        currentInterval = "interval '90 days'";
        prevInterval = "interval '180 days'";
        break;
      case "12m":
        granularity = "month";
        currentInterval = "interval '12 months'";
        prevInterval = "interval '24 months'";
        break;
    }

    // 2. Execute parallel aggregation queries
    const [
      compResult,
      bucketsResult,
      statusResult,
      productCountResult,
      topProductsResult,
      overallMetricsResult,
    ] = await Promise.all([
      // A. Period comparison (BUG-027)
      db.execute<{ current_total: number; previous_total: number }>(sql`
        SELECT
          coalesce(sum(total) FILTER (
            WHERE placed_at >= now() - ${sql.raw(currentInterval)}
              AND status NOT IN ('cancelled', 'refunded')
          ), 0)::float AS current_total,
          coalesce(sum(total) FILTER (
            WHERE placed_at >= now() - ${sql.raw(prevInterval)}
              AND placed_at < now() - ${sql.raw(currentInterval)}
              AND status NOT IN ('cancelled', 'refunded')
          ), 0)::float AS previous_total
        FROM orders
      `),

      // B. Chart bucket aggregation (BUG-028)
      db.execute<{ bucket_date: string; orders: number; revenue: number }>(sql`
        SELECT
          date_trunc(${sql.raw(`'${granularity}'`)}, placed_at AT TIME ZONE ${STORE_TIMEZONE})::text AS bucket_date,
          count(*)::int AS orders,
          coalesce(sum(total), 0)::float AS revenue
        FROM orders
        WHERE status NOT IN ('cancelled', 'refunded')
          AND placed_at >= now() - ${sql.raw(currentInterval)}
        GROUP BY 1
        ORDER BY 1 ASC
      `),

      // C. Status breakdown (BUG-028)
      db.execute<{ status: string; count: number }>(sql`
        SELECT
          status,
          count(*)::int AS count
        FROM orders
        GROUP BY status
        ORDER BY count DESC
      `),

      // D. Product counts (PERF-002)
      db.execute<{ total: number; active: number }>(sql`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE status = 'active')::int AS active
        FROM products
        WHERE deleted_at IS NULL
      `),

      // E. Top sellers by revenue
      db.execute<{ id: string; name: string; units: number; revenue: number; image: string }>(sql`
        SELECT
          coalesce(pv.product_id, oi.variant_id)::text AS id,
          oi.product_name AS name,
          sum(oi.quantity)::int AS units,
          sum(oi.line_total)::float AS revenue,
          coalesce(oi.image_url, '') AS image
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN product_variants pv ON pv.id = oi.variant_id
        WHERE o.status NOT IN ('cancelled', 'refunded')
        GROUP BY coalesce(pv.product_id, oi.variant_id), oi.product_name, oi.image_url
        ORDER BY revenue DESC
        LIMIT 5
      `),

      // F. Overall order metrics
      db.execute<{
        total_orders: number;
        total_revenue: number;
        pending_orders: number;
      }>(sql`
        SELECT
          count(*)::int AS total_orders,
          coalesce(sum(case when status in ('confirmed', 'processing', 'shipped', 'delivered') then total else 0 end), 0)::float AS total_revenue,
          count(case when status in ('awaiting_payment', 'payment_submitted', 'pending') then 1 end)::int AS pending_orders
        FROM orders
      `),
    ]);

    // 3. Compute Period comparison
    const compRow = compResult[0];
    const currentTotal = compRow?.current_total ?? 0;
    const previousTotal = compRow?.previous_total ?? 0;
    const change =
      previousTotal === 0
        ? currentTotal > 0
          ? 100
          : 0
        : ((currentTotal - previousTotal) / previousTotal) * 100;

    const previousPeriod: PeriodComparison = {
      currentTotal,
      previousTotal,
      change,
    };

    // 4. Deterministic zero-fill chart data in store timezone (BUG-028)
    const chartData = this.zeroFillBuckets(period, Array.isArray(bucketsResult) ? bucketsResult : []);

    // 5. Build status breakdown
    const statusRows = Array.isArray(statusResult) ? statusResult : [];
    const statusBreakdown: StatusBreakdownItem[] = statusRows.map((r) => ({
      status: r.status as OrderStatus,
      count: r.count,
      label: r.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      value: r.count,
    }));

    // 6. Build top products
    const topProducts: TopProductItem[] = (Array.isArray(topProductsResult) ? topProductsResult : []).map(
      (r) => ({
        id: r.id,
        name: r.name,
        units: r.units,
        revenue: r.revenue,
        image: r.image,
      })
    );

    const productRow = productCountResult[0];
    const overallRow = overallMetricsResult[0];

    return {
      metrics: {
        totalRevenue: overallRow?.total_revenue ?? 0,
        totalOrders: overallRow?.total_orders ?? 0,
        pendingOrders: overallRow?.pending_orders ?? 0,
        totalProducts: productRow?.total ?? 0,
        activeProducts: productRow?.active ?? 0,
        previousPeriodChange: change,
      },
      previousPeriod,
      chartData,
      statusBreakdown,
      topProducts,
    };
  }

  /**
   * Deterministically generates and zero-fills date buckets for chart rendering.
   */
  private zeroFillBuckets(
    period: DashboardPeriod,
    rawBuckets: Array<{ bucket_date: string; orders: number; revenue: number }>
  ): ChartBucket[] {
    const bucketMap = new Map<string, { orders: number; revenue: number }>();
    for (const b of rawBuckets) {
      if (!b.bucket_date) continue;
      const key = b.bucket_date.slice(0, 10); // YYYY-MM-DD
      bucketMap.set(key, { orders: b.orders, revenue: b.revenue });
    }

    const now = new Date();
    const result: ChartBucket[] = [];

    if (period === "7d" || period === "30d") {
      const days = period === "7d" ? 7 : 30;
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const ymd = d.toISOString().slice(0, 10);
        const found = bucketMap.get(ymd);

        const label =
          period === "7d"
            ? d.toLocaleDateString("en-GB", { weekday: "short" })
            : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

        result.push({
          label,
          revenue: found?.revenue ?? 0,
          orders: found?.orders ?? 0,
        });
      }
    } else if (period === "90d") {
      // 13 weeks
      for (let i = 12; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i * 7);
        const ymd = d.toISOString().slice(0, 10);
        const found = bucketMap.get(ymd);

        result.push({
          label: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
          revenue: found?.revenue ?? 0,
          orders: found?.orders ?? 0,
        });
      }
    } else {
      // 12 months
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ymd = d.toISOString().slice(0, 7); // YYYY-MM
        // Find matching bucket starting with YYYY-MM
        let rev = 0;
        let ord = 0;
        for (const [k, v] of bucketMap.entries()) {
          if (k.startsWith(ymd)) {
            rev += v.revenue;
            ord += v.orders;
          }
        }

        result.push({
          label: d.toLocaleDateString("en-GB", { month: "short" }),
          revenue: rev,
          orders: ord,
        });
      }
    }

    return result;
  }
}

export const analyticsService = new AnalyticsService();
