import { createSeller } from "@one-lister/core";
import { newId, sellers, user } from "@one-lister/db";
import {
  closeTestDb,
  getTestDb,
  resetTestDb,
  type TestDb,
} from "@one-lister/db/testing";
import { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { evaluateSellerAccess } from "./evaluate-seller-access";

async function seedUser(
  db: TestDb,
  opts: {
    email: string;
    emailVerified?: boolean;
    platformRole?: "ops_agent" | "admin" | null;
  },
) {
  const id = `user_${opts.email.replace(/[^a-z0-9]/gi, "_")}`;
  await db.insert(user).values({
    id,
    name: opts.email,
    email: opts.email,
    emailVerified: opts.emailVerified ?? true,
    platformRole: opts.platformRole ?? null,
  });
  return id;
}

describe("evaluateSellerAccess / requireSellerContext behaviour", () => {
  let db: TestDb;
  let redis: Redis;

  beforeAll(async () => {
    ({ db } = await getTestDb({ packageSuffix: "web" }));
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL required");
    redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
    await redis.connect();
  });

  beforeEach(async () => {
    await resetTestDb();
    const keys = await redis.keys("ol:ops-access:*");
    if (keys.length > 0) await redis.del(...keys);
  });

  afterAll(async () => {
    await closeTestDb();
    await redis.quit();
  });

  it("member allowed", async () => {
    const ownerId = await seedUser(db, { email: "m@example.com" });
    const { sellerId } = await createSeller(db, {
      userId: ownerId,
      displayName: "M",
      legalName: "M Pvt",
    });

    const decision = await evaluateSellerAccess({
      db,
      redis,
      user: { id: ownerId, emailVerified: true, platformRole: null },
      sellerId,
    });

    expect(decision.kind).toBe("ok");
    if (decision.kind === "ok") {
      expect(decision.access.memberRole).toBe("owner");
      expect(decision.access.viaOps).toBe(false);
    }
  });

  it("non-member → not_found", async () => {
    const ownerId = await seedUser(db, { email: "o@example.com" });
    const strangerId = await seedUser(db, { email: "x@example.com" });
    const { sellerId } = await createSeller(db, {
      userId: ownerId,
      displayName: "O",
      legalName: "O Pvt",
    });

    const decision = await evaluateSellerAccess({
      db,
      redis,
      user: { id: strangerId, emailVerified: true, platformRole: null },
      sellerId,
    });

    expect(decision).toEqual({ kind: "not_found" });
  });

  it("ops_agent allowed AND audit row written; repeat within hour → one row", async () => {
    const ownerId = await seedUser(db, { email: "own@example.com" });
    const opsId = await seedUser(db, {
      email: "ops@example.com",
      platformRole: "ops_agent",
    });
    const { sellerId } = await createSeller(db, {
      userId: ownerId,
      displayName: "OpsTarget",
      legalName: "OpsTarget Pvt",
    });

    const first = await evaluateSellerAccess({
      db,
      redis,
      user: { id: opsId, emailVerified: true, platformRole: "ops_agent" },
      sellerId,
    });
    expect(first.kind).toBe("ok");
    if (first.kind === "ok") {
      expect(first.access.viaOps).toBe(true);
      expect(first.wroteOpsAudit).toBe(true);
    }

    const second = await evaluateSellerAccess({
      db,
      redis,
      user: { id: opsId, emailVerified: true, platformRole: "ops_agent" },
      sellerId,
    });
    expect(second.kind).toBe("ok");
    if (second.kind === "ok") {
      expect(second.wroteOpsAudit).toBe(false);
    }

    const audits = await db.query.auditEvents.findMany({
      where: (t, { eq: e }) => e(t.action, "ops.seller_access"),
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.sellerId).toBe(sellerId);
    expect(audits[0]?.actorUserId).toBe(opsId);
  });

  it("unverified → redirect to verify-email", async () => {
    const ownerId = await seedUser(db, {
      email: "uv@example.com",
      emailVerified: false,
    });
    const sellerId = newId();
    await db.insert(sellers).values({
      id: sellerId,
      displayName: "UV",
      legalName: "UV Pvt",
      status: "active",
    });

    const decision = await evaluateSellerAccess({
      db,
      redis,
      user: { id: ownerId, emailVerified: false, platformRole: null },
      sellerId,
    });

    expect(decision).toEqual({ kind: "redirect", to: "/verify-email" });
  });
});
