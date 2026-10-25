import {
  auditEvents,
  sellerMembers,
  sellers,
  stockLocations,
  user,
  type Db,
} from "@one-lister/db";
import {
  closeTestDb,
  getTestDb,
  resetTestDb,
  type TestDb,
} from "@one-lister/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSeller } from "./create-seller.js";

async function seedUser(db: TestDb, email: string) {
  const id = `user_${email.replace(/[^a-z0-9]/gi, "_")}`;
  await db.insert(user).values({
    id,
    name: "Test",
    email,
    emailVerified: true,
  });
  return id;
}

describe("createSeller", () => {
  let db: TestDb;

  beforeAll(async () => {
    ({ db } = await getTestDb({ packageSuffix: "core" }));
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("creates seller + owner membership + default location + audit, or nothing", async () => {
    const userId = await seedUser(db, "owner@example.com");

    const result = await createSeller(db, {
      userId,
      displayName: "Jaipur Loom",
      legalName: "Jaipur Loom Pvt Ltd",
      gstin: "08AABCD1234E1Z5",
    });

    const seller = await db.query.sellers.findFirst({
      where: eq(sellers.id, result.sellerId),
    });
    expect(seller?.displayName).toBe("Jaipur Loom");
    expect(seller?.gstin).toBe("08AABCD1234E1Z5");

    const members = await db.query.sellerMembers.findMany({
      where: eq(sellerMembers.sellerId, result.sellerId),
    });
    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe("owner");
    expect(members[0]?.userId).toBe(userId);

    const locations = await db.query.stockLocations.findMany({
      where: eq(stockLocations.sellerId, result.sellerId),
    });
    expect(locations).toHaveLength(1);
    expect(locations[0]?.isDefault).toBe(true);
    expect(locations[0]?.name).toBe("Default");

    const audits = await db.query.auditEvents.findMany({
      where: eq(auditEvents.sellerId, result.sellerId),
    });
    expect(audits.some((a) => a.action === "seller.created")).toBe(true);
  });

  it("rolls back entirely when a step fails (invalid user FK)", async () => {
    await expect(
      createSeller(db as Db, {
        userId: "missing-user",
        displayName: "Ghost",
        legalName: "Ghost Pvt Ltd",
      }),
    ).rejects.toBeTruthy();

    const allSellers = await db.select().from(sellers);
    expect(allSellers).toHaveLength(0);
    const allMembers = await db.select().from(sellerMembers);
    expect(allMembers).toHaveLength(0);
    const allLocations = await db.select().from(stockLocations);
    expect(allLocations).toHaveLength(0);
  });
});
