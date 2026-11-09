import {
  pgTable,
  text,
  timestamp,
  bigint,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { baUser } from "./auth.ts";

/**
 * Audit Logs Schema
 *
 * Captures privileged administrative actions and state changes.
 * Security: RLS enabled with zero public access.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    actorId: text("actor_id").references(() => baUser.id, { onDelete: "set null" }),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_audit_logs_entity").on(table.entityType, table.entityId, table.createdAt.desc()),
    index("idx_audit_logs_actor").on(table.actorId, table.createdAt.desc()),
    index("idx_audit_logs_created").on(table.createdAt.desc()),
  ]
);
