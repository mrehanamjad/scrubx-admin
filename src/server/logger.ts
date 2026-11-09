import crypto from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEY_REGEX = /password|secret|token|proof|iban|accountNumber|cookie|auth|credentials|authorization/i;

/**
 * Recursively redacts sensitive keys matching credentials, tokens, or PII.
 */
export function redactSensitiveFields(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveFields(item, depth + 1));
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      redacted[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redactSensitiveFields(value, depth + 1);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Emits a structured JSON log line with standardized fields.
 */
export function log(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {}
) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(redactSensitiveFields(fields) as Record<string, unknown>),
  });

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function generateRequestId(): string {
  return crypto.randomUUID();
}
