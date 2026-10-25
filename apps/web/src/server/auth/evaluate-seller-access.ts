import {
  recordOpsSellerAccess,
  resolveSellerAccess,
  type PlatformRole,
  type SellerAccessOk,
} from "@one-lister/core";
import type { Db } from "@one-lister/db";
import type { Redis } from "ioredis";

export type SellerAccessDecision =
  | { kind: "ok"; access: SellerAccessOk; wroteOpsAudit: boolean }
  | { kind: "not_found" }
  | { kind: "redirect"; to: "/verify-email" };

export type AccessUser = {
  id: string;
  emailVerified: boolean;
  platformRole?: PlatformRole | null;
};

function asPlatformRole(
  value: AccessUser["platformRole"],
): PlatformRole | null {
  if (value === "ops_agent" || value === "admin") return value;
  return null;
}

/**
 * Seller-access evaluation without Next.js redirects.
 * requireSellerContext maps decisions to redirect()/notFound().
 */
export async function evaluateSellerAccess(params: {
  db: Db;
  redis: Redis;
  user: AccessUser;
  sellerId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<SellerAccessDecision> {
  if (!params.user.emailVerified) {
    return { kind: "redirect", to: "/verify-email" };
  }

  const access = await resolveSellerAccess(params.db, {
    userId: params.user.id,
    sellerId: params.sellerId,
    platformRole: asPlatformRole(params.user.platformRole),
  });

  if (!access.ok) {
    return { kind: "not_found" };
  }

  let wroteOpsAudit = false;
  if (access.viaOps && access.platformRole) {
    const result = await recordOpsSellerAccess({
      db: params.db,
      redis: params.redis,
      userId: params.user.id,
      sellerId: params.sellerId,
      platformRole: access.platformRole,
      ip: params.ip,
      userAgent: params.userAgent,
    });
    wroteOpsAudit = result.wrote;
  }

  return { kind: "ok", access, wroteOpsAudit };
}
