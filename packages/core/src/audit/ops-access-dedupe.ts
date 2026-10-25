import type { Redis } from "ioredis";

import type { Db } from "@one-lister/db";

import { writeAuditEvent } from "./write-audit-event.js";

const OPS_ACCESS_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Write an `ops.seller_access` audit row at most once per user+seller per hour.
 * Uses Redis SET NX for dedupe; if Redis is unavailable, still writes (fail-open
 * for audit completeness over strict dedupe).
 */
export async function recordOpsSellerAccess(params: {
  db: Db;
  redis: Redis;
  userId: string;
  sellerId: string;
  platformRole: "ops_agent" | "admin";
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ wrote: boolean }> {
  const key = `ol:ops-access:${params.userId}:${params.sellerId}`;

  let shouldWrite = true;
  try {
    const set = await params.redis.set(key, "1", "EX", OPS_ACCESS_TTL_SECONDS, "NX");
    shouldWrite = set === "OK";
  } catch {
    // Redis down — still audit (may duplicate within the hour).
    shouldWrite = true;
  }

  if (!shouldWrite) {
    return { wrote: false };
  }

  await writeAuditEvent(params.db, {
    sellerId: params.sellerId,
    actorUserId: params.userId,
    actorPlatformRole: params.platformRole,
    action: "ops.seller_access",
    targetType: "seller",
    targetId: params.sellerId,
    ip: params.ip,
    userAgent: params.userAgent,
  });

  return { wrote: true };
}
