import {
  pgTable,
  text,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { baUser } from "./auth.ts";

/**
 * Stateful notification read receipts per administrator (ECOM-011)
 */
export const notificationReads = pgTable(
  "notification_reads",
  {
    userId: text("user_id")
      .notNull()
      .references(() => baUser.id, { onDelete: "cascade" }),
    notificationKey: text("notification_key").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.notificationKey] }),
  ]
);
