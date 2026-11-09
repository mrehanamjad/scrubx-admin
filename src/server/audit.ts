import { db } from "../db/index.ts";
import { auditLogs } from "../db/schema/index.ts";
import type { DatabaseExecutor } from "./repositories/base.repository.ts";
import type { AdminContext } from "./auth.ts";

export interface CreateAuditLogParams {
  action: string;
  entityType: string;
  entityId?: string | null;
  admin: AdminContext;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

/**
 * Records an immutable audit log entry for privileged operations (DB-014).
 * Redacts any sensitive secrets or payment instrument details.
 */
export async function recordAuditLog(
  params: CreateAuditLogParams,
  executor: DatabaseExecutor = db
) {
  try {
    await executor.insert(auditLogs).values({
      actorId: params.admin.id,
      actorRole: params.admin.role,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      before: params.before ?? null,
      after: params.after ?? null,
      metadata: params.metadata ?? {},
    });
  } catch (err) {
    console.error("[Audit Log Error]: Failed to record audit log:", err);
  }
}
