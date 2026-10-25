import type { Redis } from "ioredis";

/**
 * Better Auth SecondaryStorage backed by ioredis.
 * Used for rate-limit counters across multiple ECS tasks (not in-memory).
 */
export function createRedisSecondaryStorage(redis: Redis) {
  return {
    async get(key: string): Promise<string | null> {
      return redis.get(key);
    },
    async getAndDelete(key: string): Promise<string | null> {
      // GETDEL (Redis 6.2+); Redis 7 Alpine in docker-compose supports it.
      return redis.getdel(key);
    },
    async increment(key: string, ttl: number): Promise<number> {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, ttl);
      }
      return count;
    },
    async set(key: string, value: string, ttl?: number): Promise<void> {
      if (ttl !== undefined) {
        await redis.set(key, value, "EX", ttl);
      } else {
        await redis.set(key, value);
      }
    },
    async delete(key: string): Promise<void> {
      await redis.del(key);
    },
  };
}
