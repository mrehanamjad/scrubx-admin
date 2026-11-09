import { sql, type SQL } from "drizzle-orm";

export const STORE_TIMEZONE = "Asia/Karachi";

/**
 * Returns a SQL expression for current date in store timezone (Asia/Karachi).
 */
export function sqlCurrentDateInStoreTz(): SQL {
  return sql`(now() AT TIME ZONE '${sql.raw(STORE_TIMEZONE)}')::date`;
}

/**
 * Returns a SQL expression converting a timestamp column to a date in store timezone.
 */
export function sqlColDateInStoreTz(column: any): SQL {
  return sql`(${column} AT TIME ZONE '${sql.raw(STORE_TIMEZONE)}')::date`;
}

/**
 * Returns a SQL expression truncating a timestamp column to a given granularity in store timezone.
 */
export function sqlDateTruncInStoreTz(granularity: "day" | "week" | "month", column: any): SQL {
  return sql`date_trunc('${sql.raw(granularity)}', ${column} AT TIME ZONE '${sql.raw(STORE_TIMEZONE)}')`;
}
