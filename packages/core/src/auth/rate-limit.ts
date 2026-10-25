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

function rateLimitKey(keyParts: string[]): string {
  return `ol:rl:${keyParts.map(sanitizeKeyPart).join(":")}`;
}

function sanitizeKeyPart(part: string): string {
  return part.trim().toLowerCase().replace(/[^a-z0-9@._-]+/g, "_");
}

/**
 * Atomic Redis INCR + EXPIRE rate limiter.
 * Keys are namespaced under `ol:rl:`.
 */
export async function consumeRateLimit(
  redis: Redis,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const key = rateLimitKey(options.keyParts);
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

/**
 * Read the current counter without incrementing.
 * `allowed` is false when another consume would be rejected (count >= max).
 */
export async function peekRateLimit(
  redis: Redis,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const key = rateLimitKey(options.keyParts);
  const raw = await redis.get(key);
  const count = raw ? Number.parseInt(raw, 10) : 0;
  const safeCount = Number.isFinite(count) ? count : 0;

  if (safeCount >= options.max) {
    const ttl = await redis.ttl(key);
    return {
      allowed: false,
      count: safeCount,
      retryAfterSeconds: ttl > 0 ? ttl : options.windowSeconds,
    };
  }

  return { allowed: true, count: safeCount };
}

/** Auth endpoints: 5 attempts per email per 15-minute window. */
export const AUTH_RATE_LIMIT = {
  max: 5,
  windowSeconds: 15 * 60,
} as const;

/**
 * Sign-in per-IP ceiling (all attempts). Higher than the per-email failed-only
 * limit so shared NATs are not locked out as quickly.
 */
export const AUTH_SIGN_IN_IP_RATE_LIMIT = {
  max: 30,
  windowSeconds: 15 * 60,
} as const;

/** Peek whether this email is already blocked for failed sign-ins. */
export async function peekSignInEmailLimit(
  redis: Redis,
  email: string,
): Promise<RateLimitResult> {
  return peekRateLimit(redis, {
    keyParts: ["sign-in", "email", email],
    max: AUTH_RATE_LIMIT.max,
    windowSeconds: AUTH_RATE_LIMIT.windowSeconds,
  });
}

/** Record a failed sign-in against the per-email counter. */
export async function recordSignInEmailFailure(
  redis: Redis,
  email: string,
): Promise<RateLimitResult> {
  return consumeRateLimit(redis, {
    keyParts: ["sign-in", "email", email],
    max: AUTH_RATE_LIMIT.max,
    windowSeconds: AUTH_RATE_LIMIT.windowSeconds,
  });
}

/** Consume one sign-in attempt against the per-IP counter (success or failure). */
export async function consumeSignInIpLimit(
  redis: Redis,
  ip: string,
): Promise<RateLimitResult> {
  return consumeRateLimit(redis, {
    keyParts: ["sign-in", "ip", ip],
    max: AUTH_SIGN_IN_IP_RATE_LIMIT.max,
    windowSeconds: AUTH_SIGN_IN_IP_RATE_LIMIT.windowSeconds,
  });
}
