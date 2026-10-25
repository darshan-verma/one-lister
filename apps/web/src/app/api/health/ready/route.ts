import { loadEnv } from "@one-lister/config/env";
import { checkDatabase } from "@one-lister/db";
import { NextResponse } from "next/server";

import { checkRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "error";

/** Readiness probe — verifies Postgres and Redis via shared clients. */
export async function GET() {
  const env = loadEnv();

  const [dbOk, redisOk] = await Promise.all([
    checkDatabase(env.DATABASE_URL),
    checkRedis(env.REDIS_URL),
  ]);

  const db: CheckStatus = dbOk ? "ok" : "error";
  const redis: CheckStatus = redisOk ? "ok" : "error";
  const status: CheckStatus = db === "ok" && redis === "ok" ? "ok" : "error";

  return NextResponse.json(
    { status, db, redis },
    { status: status === "ok" ? 200 : 503 },
  );
}
