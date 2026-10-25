import {
  sellerMembers,
  sellers,
  type Db,
} from "@one-lister/db";
import { and, eq } from "drizzle-orm";

export type PlatformRole = "ops_agent" | "admin";
export type MemberRole = "owner" | "staff";

export type SellerAccessOk = {
  ok: true;
  userId: string;
  sellerId: string;
  memberRole: MemberRole | null;
  platformRole: PlatformRole | null;
  viaOps: boolean;
};

export type SellerAccessDenied =
  | { ok: false; reason: "seller_not_found" }
  | { ok: false; reason: "not_a_member" };

export type ResolveSellerAccessInput = {
  userId: string;
  sellerId: string;
  platformRole: PlatformRole | null | undefined;
};

/**
 * Pure seller-access resolution (no Next.js redirects).
 * Callers map `seller_not_found` / `not_a_member` to notFound() (404).
 */
export async function resolveSellerAccess(
  db: Db,
  input: ResolveSellerAccessInput,
): Promise<SellerAccessOk | SellerAccessDenied> {
  const seller = await db.query.sellers.findFirst({
    where: eq(sellers.id, input.sellerId),
    columns: { id: true },
  });
  if (!seller) {
    return { ok: false, reason: "seller_not_found" };
  }

  const platformRole = input.platformRole ?? null;
  if (platformRole === "ops_agent" || platformRole === "admin") {
    return {
      ok: true,
      userId: input.userId,
      sellerId: input.sellerId,
      memberRole: null,
      platformRole,
      viaOps: true,
    };
  }

  const member = await db.query.sellerMembers.findFirst({
    where: and(
      eq(sellerMembers.sellerId, input.sellerId),
      eq(sellerMembers.userId, input.userId),
    ),
  });

  if (!member) {
    return { ok: false, reason: "not_a_member" };
  }

  return {
    ok: true,
    userId: input.userId,
    sellerId: input.sellerId,
    memberRole: member.role,
    platformRole: null,
    viaOps: false,
  };
}

export function requireOwnerRole(
  ctx: Pick<SellerAccessOk, "memberRole" | "platformRole">,
): boolean {
  if (ctx.platformRole === "admin" || ctx.platformRole === "ops_agent") {
    return true;
  }
  return ctx.memberRole === "owner";
}
