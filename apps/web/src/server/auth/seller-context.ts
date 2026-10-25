import {
  requireOwnerRole as coreRequireOwnerRole,
  type MemberRole,
  type PlatformRole,
} from "@one-lister/core";
import { loadEnv } from "@one-lister/config/env";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getAppDb } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { getClientIp } from "@/server/http";

import {
  evaluateSellerAccess,
  type SellerAccessDecision,
} from "./evaluate-seller-access";
import { requireUser, type SessionUser } from "@/server/auth/session";

export type SellerContext = {
  userId: string;
  sellerId: string;
  memberRole: MemberRole | null;
  platformRole: PlatformRole | null;
  user: SessionUser;
};

export type { SellerAccessDecision };
export { evaluateSellerAccess };

/**
 * Authorize access to a seller tenant.
 * - Members: allowed with their role
 * - Non-members: notFound() (404, never 403)
 * - ops_agent / admin: allowed for any existing seller; audit once/hour via Redis
 * - Unverified email: redirect to /verify-email
 */
export async function requireSellerContext(
  sellerId: string,
): Promise<SellerContext> {
  const user = await requireUser();
  const env = loadEnv();
  const redis = getRedis(env.REDIS_URL);
  if (redis.status === "wait" || redis.status === "end") {
    await redis.connect();
  }
  const h = await headers();

  const decision = await evaluateSellerAccess({
    db: getAppDb(),
    redis,
    user: {
      id: user.id,
      emailVerified: user.emailVerified,
      platformRole:
        user.platformRole === "ops_agent" || user.platformRole === "admin"
          ? user.platformRole
          : null,
    },
    sellerId,
    ip: getClientIp(h, env.TRUSTED_PROXY_COUNT),
    userAgent: h.get("user-agent"),
  });

  if (decision.kind === "redirect") {
    redirect(decision.to);
  }
  if (decision.kind === "not_found") {
    notFound();
  }

  return {
    userId: decision.access.userId,
    sellerId: decision.access.sellerId,
    memberRole: decision.access.memberRole,
    platformRole: decision.access.platformRole,
    user,
  };
}

/** Owner-only helper. Ops/admin also pass. Throws notFound when denied. */
export function requireRole(ctx: SellerContext, role: "owner"): void {
  if (role === "owner" && !coreRequireOwnerRole(ctx)) {
    notFound();
  }
}
