import type { Redis } from "ioredis";

export type RateLimitResult =
  | { allowed: true; count: number }
  | { allowed: false; count: number; retryAfterSeconds: number };

export type RateLimitOptions = {
  /** Logical key parts (e.g. action, email, ip). */
  keyParts: string[];
  /** Max allowed hits within the window (inclusive). The (max+1)th is rejected. */
  max: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

/**
 * Atomic Redis INCR + EXPIRE rate limiter.
 * Keys are namespaced under `ol:rl:`.
 */
export async function consumeRateLimit(
  redis: Redis,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const key = `ol:rl:${options.keyParts.map(sanitizeKeyPart).join(":")}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, options.windowSeconds);
  }

  if (count > options.max) {
    const ttl = await redis.ttl(key);
    return {
      allowed: false,
      count,
      retryAfterSeconds: ttl > 0 ? ttl : options.windowSeconds,
    };
  }

  return { allowed: true, count };
}

function sanitizeKeyPart(part: string): string {
  return part.trim().toLowerCase().replace(/[^a-z0-9@._-]+/g, "_");
}

/** Auth endpoints: 5 attempts per email (and per IP) per 15-minute window. */
export const AUTH_RATE_LIMIT = {
  max: 5,
  windowSeconds: 15 * 60,
} as const;
