import { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AUTH_RATE_LIMIT, consumeRateLimit } from "./rate-limit.js";

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
  });

  afterAll(async () => {
    const keys = await redis.keys(`ol:rl:${prefix}:*`);
    if (keys.length > 0) await redis.del(...keys);
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
