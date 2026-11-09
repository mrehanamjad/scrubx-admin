import { z } from "zod";
import { getCurrentAdmin, assertRole, type AdminContext } from "./auth.ts";
import type { AdminRole } from "../db/schema/index.ts";
import { toActionError, AuthorizationError } from "./errors.ts";
import type { ActionResponse } from "./types.ts";
import { checkRateLimit } from "./rate-limit.ts";
import { log, generateRequestId } from "./logger.ts";

export interface ActionConfig<TInput> {
  /**
   * Optional Zod schema to parse and validate incoming payload.
   */
  schema?: z.ZodType<TInput>;

  /**
   * Minimum required role hierarchy level.
   * Defaults to 'staff'. Every Server Action strictly requires an authenticated staff context.
   */
  requiredRole?: AdminRole;
}

/**
 * Creates a type-safe, protected Server Action wrapper.
 *
 * Guarantees:
 * 1. Automatic session authentication & role hierarchy verification (no anonymous fallback).
 * 2. Automatic input parsing and field error formatting via Zod.
 * 3. Rate limiting protection on actions (60 requests/minute per staff member).
 * 4. Consistent, sanitized ActionResponse<T> with zero database secret leaks.
 */
export function createSafeAction<TInput, TOutput>(
  config: ActionConfig<TInput>,
  handler: (params: { input: TInput; admin: AdminContext }) => Promise<TOutput>
): (input: TInput) => Promise<ActionResponse<TOutput>> {
  return async (rawInput: TInput): Promise<ActionResponse<TOutput>> => {
    const requestId = generateRequestId();
    const startTime = performance.now();
    let currentAdminId: string | undefined;

    try {
      // 1. Authorization & Session Enforcement (ARCH-003: no fabricated anonymous principal)
      const requiredRole = config.requiredRole ?? "staff";
      const admin = await getCurrentAdmin();
      assertRole(admin, [requiredRole]);

      if (!admin || admin.id === "anonymous") {
        throw new AuthorizationError("Active administrative session required.");
      }

      currentAdminId = admin.id;

      // 2. Rate Limiting Protection (SEC-011)
      const rateLimit = checkRateLimit(`action:${admin.id}`, 60, 60 * 1000);
      if (!rateLimit.success) {
        log("warn", "action.rate_limited", {
          adminId: admin.id,
          requestId,
          durationMs: Math.round(performance.now() - startTime),
        });
        return {
          success: false,
          error: "Too many requests. Please slow down.",
          code: "RATE_LIMITED",
          requestId,
        };
      }

      // 3. Input Validation
      let parsedInput: TInput = rawInput;
      if (config.schema) {
        parsedInput = await config.schema.parseAsync(rawInput);
      }

      // 4. Handler Execution
      const result = await handler({ input: parsedInput, admin });

      return {
        success: true,
        data: result,
        requestId,
      };
    } catch (error) {
      const serialized = toActionError(error);
      log("error", "action.failed", {
        code: serialized.code,
        error: serialized.error,
        adminId: currentAdminId,
        requestId,
        durationMs: Math.round(performance.now() - startTime),
      });

      return {
        success: false,
        error: serialized.error,
        code: serialized.code,
        fieldErrors: serialized.fieldErrors,
        requestId,
      };
    }
  };
}
