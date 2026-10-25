import { Redis } from "ioredis";

const globalForRedis = globalThis as typeof globalThis & {
  __oneListerRedis?: Redis;
};

let singleton: Redis | undefined;

/**
 * Lazily create a per-process shared Redis client.
 * In development the instance is stored on `globalThis` so Next.js HMR
 * does not leak connections.
 */
export function getRedis(redisUrl: string): Redis {
  if (process.env.NODE_ENV !== "production") {
    if (!globalForRedis.__oneListerRedis) {
      globalForRedis.__oneListerRedis = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 3000,
        lazyConnect: true,
      });
    }
    return globalForRedis.__oneListerRedis;
  }

  if (!singleton) {
    singleton = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      lazyConnect: true,
    });
  }
  return singleton;
}

/** Connectivity check against the shared client. */
export async function checkRedis(redisUrl: string): Promise<boolean> {
  const redis = getRedis(redisUrl);

  try {
    if (redis.status === "wait" || redis.status === "end") {
      await redis.connect();
    }
    const pong = await redis.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}
