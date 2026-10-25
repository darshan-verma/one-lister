import { loadEnv } from "@one-lister/config/env";
import { checkDatabase } from "@one-lister/db";
import { Redis } from "ioredis";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "error";

async function checkRedis(redisUrl: string): Promise<CheckStatus> {
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 3000,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    const pong = await redis.ping();
    return pong === "PONG" ? "ok" : "error";
  } catch {
    return "error";
  } finally {
    redis.disconnect();
  }
}

export async function GET() {
  const env = loadEnv();

  const [dbOk, redis] = await Promise.all([
    checkDatabase(env.DATABASE_URL).then((ok): CheckStatus => (ok ? "ok" : "error")),
    checkRedis(env.REDIS_URL),
  ]);

  const status: CheckStatus = dbOk === "ok" && redis === "ok" ? "ok" : "error";
  const body = { status, db: dbOk, redis };

  return NextResponse.json(body, {
    status: status === "ok" ? 200 : 503,
  });
}
