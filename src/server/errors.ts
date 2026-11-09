import { ZodError } from "zod";

/**
 * Base Application Error
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "INTERNAL_SERVER_ERROR",
    isOperational: boolean = true,
    details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 401 Unauthorized Error
 */
export class AuthenticationError extends AppError {
  constructor(message: string = "Authentication required. Please sign in.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

/**
 * 403 Forbidden Error
 */
export class AuthorizationError extends AppError {
  constructor(message: string = "Forbidden: You do not have permission to perform this action.") {
    super(message, 403, "FORBIDDEN");
  }
}

/**
 * 400 Validation Error with structured field errors
 */
export class ValidationError extends AppError {
  public readonly fieldErrors?: Record<string, string[]>;

  constructor(
    message: string = "Invalid input data.",
    fieldErrors?: Record<string, string[]>
  ) {
    super(message, 400, "VALIDATION_ERROR", true, fieldErrors);
    this.fieldErrors = fieldErrors;
  }
}

/**
 * 404 Not Found Error
 */
export class NotFoundError extends AppError {
  constructor(resource: string = "Resource", identifier?: string) {
    const msg = identifier
      ? `${resource} with identifier '${identifier}' was not found.`
      : `${resource} was not found.`;
    super(msg, 404, "NOT_FOUND");
  }
}

/**
 * 409 Conflict Error (Duplicate key or state collision)
 */
export class ConflictError extends AppError {
  constructor(message: string = "A record with this identifier already exists.") {
    super(message, 409, "CONFLICT");
  }
}

/**
 * 500 Sanitized Database Error
 */
export class DatabaseError extends AppError {
  constructor(message: string = "A database operation failed.") {
    super(message, 500, "DATABASE_ERROR", false);
  }
}

/**
 * Serialized error shape for Server Actions
 */
export interface SerializedActionError {
  error: string;
  code: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Formats any caught error into a safe, sanitized client-facing response.
 * Never exposes credentials, database tables, or sensitive traces to clients.
 */
export function toActionError(error: unknown): SerializedActionError {
  // 1. Zod Validation Errors
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const path = issue.path.join(".");
      const key = path || "root";
      if (!fieldErrors[key]) {
        fieldErrors[key] = [];
      }
      fieldErrors[key].push(issue.message);
    }

    const firstMessage = error.issues[0]?.message || "Validation failed.";
    return {
      error: firstMessage,
      code: "VALIDATION_ERROR",
      fieldErrors,
    };
  }

  // 2. Custom App Errors
  if (error instanceof AppError) {
    return {
      error: error.message,
      code: error.code,
      fieldErrors: (error as ValidationError).fieldErrors,
    };
  }

  // 3. PostgreSQL Database Error Codes (via postgres.js / Drizzle)
  if (typeof error === "object" && error !== null && "code" in error) {
    const pgCode = String((error as { code: unknown }).code);

    // 23505: Unique violation (e.g. unique slug, email)
    if (pgCode === "23505") {
      return {
        error: "A record with this identifier already exists.",
        code: "CONFLICT",
      };
    }

    // 23503: Foreign key violation
    if (pgCode === "23503") {
      return {
        error: "Referenced record does not exist or cannot be linked.",
        code: "FOREIGN_KEY_VIOLATION",
      };
    }

    // 23514: Check constraint violation
    if (pgCode === "23514") {
      return {
        error: "Operation violates business validation rules.",
        code: "CHECK_CONSTRAINT_VIOLATION",
      };
    }

    // P0001: Custom raise_exception from Postgres triggers
    if (pgCode === "P0001" && "message" in error) {
      const triggerMsg = String((error as { message: unknown }).message);
      return {
        error: triggerMsg,
        code: "TRIGGER_POLICY_VIOLATION",
      };
    }

    // 40P01: Deadlock detected, 40001: Serialization failure (BUG-004)
    if (pgCode === "40P01" || pgCode === "40001") {
      return {
        error: "The system was busy processing a concurrent change. Please retry.",
        code: "CONFLICT",
      };
    }
  }

  // 4. Fallback for generic or unhandled errors
  console.error("[Unhandled Server Error]:", error);

  return {
    error: "An unexpected error occurred. Please try again later.",
    code: "INTERNAL_SERVER_ERROR",
  };
}
