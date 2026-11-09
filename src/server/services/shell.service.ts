import { cache } from "react";
import { sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { formatPKR } from "../../lib/format.ts";
import { STORE_TIMEZONE } from "../../lib/time.ts";

export interface ShellNotification {
  id: string;
  key: string;
  title: string;
  body: string;
  at: string;
  to: string;
  isRead: boolean;
}

export interface ShellSummary {
  stats: {
    pendingOrders: number;
    pendingPayments: number;
    lowStockCount: number;
    todaysRevenue: number;
  };
  notifications: ShellNotification[];
}

const DEFAULT_SUMMARY: ShellSummary = {
  stats: {
    pendingOrders: 0,
    pendingPayments: 0,
    lowStockCount: 0,
    todaysRevenue: 0,
  },
  notifications: [],
};

const serializeDate = (date: Date | string | null) => {
  if (!date) return new Date().toISOString();
  if (typeof date === "string") return date;
  return date.toISOString();
};

/**
 * Request-scoped cached fetch for root layout shell metrics and notifications.
 * Issues at most 2 queries per render.
 */
export const getShellSummary = cache(async (adminUserId: string | null): Promise<ShellSummary> => {
  if (!adminUserId) {
    return DEFAULT_SUMMARY;
  }

  try {
    // Query 1: Single combined scalar subqueries for counters in Karachi timezone
    const statsQuery = db.execute<{
      pending_orders: number;
      pending_payments: number;
      low_stock: number;
      todays_revenue: number;
    }>(sql`
      SELECT
        (SELECT count(*) FROM orders WHERE status IN ('awaiting_payment', 'payment_submitted', 'pending'))::int AS pending_orders,
        (SELECT count(*) FROM payments WHERE status = 'awaiting_verification')::int AS pending_payments,
        (SELECT count(*) FROM inventory WHERE (quantity_on_hand - quantity_reserved) <= reorder_level)::int AS low_stock,
        (SELECT coalesce(sum(total), 0) FROM orders
          WHERE (created_at AT TIME ZONE ${STORE_TIMEZONE})::date = (now() AT TIME ZONE ${STORE_TIMEZONE})::date
            AND status NOT IN ('cancelled', 'refunded'))::int AS todays_revenue
    `);

    // Query 2: Single UNION ALL query for recent pending notifications with user read receipts (ECOM-011)
    const notifsQuery = db.execute<{
      kind: "payment" | "order";
      id: string;
      notification_key: string;
      title_extra: string;
      body: string;
      created_at: Date;
      is_read: boolean;
    }>(sql`
      (
        SELECT
          'payment' AS kind,
          p.id,
          ('payment:' || p.id)::text AS notification_key,
          p.amount::text AS title_extra,
          '' AS body,
          p.created_at,
          (nr.read_at IS NOT NULL) AS is_read
        FROM payments p
        LEFT JOIN notification_reads nr 
          ON nr.user_id = ${adminUserId} AND nr.notification_key = ('payment:' || p.id)
        WHERE p.status = 'awaiting_verification'
        ORDER BY p.created_at DESC
        LIMIT 4
      )
      UNION ALL
      (
        SELECT
          'order' AS kind,
          o.id,
          ('order:' || o.id)::text AS notification_key,
          o.order_number AS title_extra,
          coalesce(o.shipping_address->>'fullName', 'Customer') AS body,
          o.created_at,
          (nr.read_at IS NOT NULL) AS is_read
        FROM orders o
        LEFT JOIN notification_reads nr 
          ON nr.user_id = ${adminUserId} AND nr.notification_key = ('order:' || o.id)
        WHERE o.status IN ('awaiting_payment', 'payment_submitted', 'pending')
        ORDER BY o.created_at DESC
        LIMIT 4
      )
    `);

    const [statsResult, notifsResult] = await Promise.all([statsQuery, notifsQuery]);

    const statsRow = statsResult[0];
    const notifications: ShellNotification[] = [];

    if (Array.isArray(notifsResult)) {
      for (const row of notifsResult) {
        if (row.kind === "payment") {
          notifications.push({
            id: row.id,
            key: row.notification_key,
            title: "Payment awaiting verification",
            body: formatPKR(Number(row.title_extra) || 0),
            at: serializeDate(row.created_at),
            to: "/payments",
            isRead: Boolean(row.is_read),
          });
        } else if (row.kind === "order") {
          notifications.push({
            id: row.id,
            key: row.notification_key,
            title: `Order ${row.title_extra} needs attention`,
            body: row.body || "Customer",
            at: serializeDate(row.created_at),
            to: `/orders/${row.id}`,
            isRead: Boolean(row.is_read),
          });
        }
      }
    }

    return {
      stats: {
        pendingOrders: statsRow?.pending_orders ?? 0,
        pendingPayments: statsRow?.pending_payments ?? 0,
        lowStockCount: statsRow?.low_stock ?? 0,
        todaysRevenue: statsRow?.todays_revenue ?? 0,
      },
      notifications,
    };
  } catch (err) {
    console.error("[Shell Summary Error]: Failed to fetch shell summary:", err);
    return DEFAULT_SUMMARY;
  }
});
