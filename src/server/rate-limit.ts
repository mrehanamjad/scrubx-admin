/**
 * In-Memory Token Bucket / Window Rate Limiter
 *
 * NOTE & ARCHITECTURAL LIMITATION:
 * This rate limiter stores buckets in a local Node.js process Map.
 * - Suitable for single-instance Next.js node deployments.
 * - Resets on cold start and process restart.
 * - For multi-instance, clustered, or distributed serverless environments,
 *   replace this backing store with Redis / Upstash (prerequisite documented in SEC-011).
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitRecord>();

// Periodic cleanup of expired rate limit entries every 5 minutes to prevent memory leaks
if (typeof setInterval !== "undefined") {
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (record.resetAt <= now) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  // Unref interval if running in Node.js so it does not block process shutdown
  if (cleanupInterval && typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    (cleanupInterval as NodeJS.Timeout).unref();
  }
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Checks and increments rate limit for a specific key.
 *
 * @param key Unique identifier (e.g. `sign-in:${ip}` or `upload:${userId}`)
 * @param limit Maximum allowed requests within the time window
 * @param windowMs Time window in milliseconds (e.g. 60_000 for 1 minute)
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return {
      success: true,
      limit,
      remaining: limit - 1,
      resetAt,
    };
  }

  if (existing.count >= limit) {
    return {
      success: false,
      limit,
      remaining: 0,
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  return {
    success: true,
    limit,
    remaining: limit - existing.count,
    resetAt: existing.resetAt,
  };
}

/**
 * Helper to extract client IP from incoming request or headers.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    // First hop is the original client IP
    const firstIp = forwarded.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "127.0.0.1";
}
