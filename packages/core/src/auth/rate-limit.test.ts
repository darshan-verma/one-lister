import { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  AUTH_RATE_LIMIT,
  AUTH_SIGN_IN_IP_RATE_LIMIT,
  consumeRateLimit,
  consumeSignInIpLimit,
  peekSignInEmailLimit,
  recordSignInEmailFailure,
} from "./rate-limit.js";

describe("consumeRateLimit", () => {
  let redis: Redis;
  const prefix = `test-rl-${Date.now()}`;

  beforeAll(async () => {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL required");
    redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
    await redis.connect();
  });

  beforeEach(async () => {
    const keys = await redis.keys(`ol:rl:${prefix}:*`);
    if (keys.length > 0) await redis.del(...keys);
    // Also clear sign-in keys used by dedicated helpers in this file's suite.
    const signInKeys = await redis.keys(`ol:rl:sign-in:*`);
    if (signInKeys.length > 0) await redis.del(...signInKeys);
  });

  afterAll(async () => {
    const keys = await redis.keys(`ol:rl:${prefix}:*`);
    if (keys.length > 0) await redis.del(...keys);
    const signInKeys = await redis.keys(`ol:rl:sign-in:*`);
    if (signInKeys.length > 0) await redis.del(...signInKeys);
    await redis.quit();
  });

  it("allows 5 attempts then rejects the 6th for the same email", async () => {
    const email = "rate@example.com";
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(
        await consumeRateLimit(redis, {
          keyParts: [prefix, "sign-in", "email", email],
          max: AUTH_RATE_LIMIT.max,
          windowSeconds: AUTH_RATE_LIMIT.windowSeconds,
        }),
      );
    }

    expect(results.slice(0, 5).every((r) => r.allowed)).toBe(true);
    expect(results[5]?.allowed).toBe(false);
  });
});

describe("sign-in failed-email vs all-IP limits", () => {
  let redis: Redis;

  beforeAll(async () => {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL required");
    redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
    await redis.connect();
  });

  beforeEach(async () => {
    const keys = await redis.keys(`ol:rl:sign-in:*`);
    if (keys.length > 0) await redis.del(...keys);
  });

  afterAll(async () => {
    const keys = await redis.keys(`ol:rl:sign-in:*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
  });

  it("5 successful sign-ins do not consume the per-email failure budget", async () => {
    const email = "ok@example.com";
    const ip = "203.0.113.10";

    for (let i = 0; i < 5; i++) {
      // Successful attempt: IP counted, email not.
      const ipResult = await consumeSignInIpLimit(redis, ip);
      expect(ipResult.allowed).toBe(true);
      const peek = await peekSignInEmailLimit(redis, email);
      expect(peek.allowed).toBe(true);
      expect(peek.count).toBe(0);
    }
  });

  it("6th failed attempt for one email is blocked", async () => {
    const email = "fail@example.com";

    for (let i = 0; i < 5; i++) {
      const r = await recordSignInEmailFailure(redis, email);
      expect(r.allowed).toBe(true);
    }

    const peek = await peekSignInEmailLimit(redis, email);
    expect(peek.allowed).toBe(false);

    const sixth = await recordSignInEmailFailure(redis, email);
    expect(sixth.allowed).toBe(false);
  });

  it("per-IP allows up to AUTH_SIGN_IN_IP_RATE_LIMIT.max", async () => {
    const ip = "198.51.100.7";
    for (let i = 0; i < AUTH_SIGN_IN_IP_RATE_LIMIT.max; i++) {
      const r = await consumeSignInIpLimit(redis, ip);
      expect(r.allowed).toBe(true);
    }
    const blocked = await consumeSignInIpLimit(redis, ip);
    expect(blocked.allowed).toBe(false);
  });
});
