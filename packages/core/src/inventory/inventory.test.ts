import {
  channelAccounts,
  channelListings,
  inventoryLevels,
  inventoryMovements,
  newId,
  products,
  sellers,
  stockLocations,
  variants,
  type Db,
} from "@one-lister/db";
import {
  closeTestDb,
  getTestDb,
  resetTestDb,
  type TestDb,
} from "@one-lister/db/testing";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  IdempotencyConflictError,
  InsufficientStockError,
  InvalidMovementError,
  TenantMismatchError,
} from "../errors.js";
import {
  getAvailableForChannel,
  getStockLevel,
  rebuildLevelsFromLedger,
  recordMovement,
} from "./index.js";

async function seedSeller(db: TestDb, label: string) {
  const sellerId = newId();
  const locationId = newId();
  const productId = newId();
  const variantId = newId();
  const accountId = newId();

  await db.insert(sellers).values({
    id: sellerId,
    displayName: `Seller ${label}`,
    legalName: `Seller ${label} Pvt Ltd`,
    status: "active",
  });

  await db.insert(stockLocations).values({
    id: locationId,
    sellerId,
    name: `${label} Warehouse`,
    isDefault: true,
  });

  await db.insert(products).values({
    id: productId,
    sellerId,
    title: `${label} Product`,
    status: "active",
  });

  await db.insert(variants).values({
    id: variantId,
    productId,
    sellerId,
    sku: `${label}-SKU-1`,
    mrpPaise: 100_00,
    sellingPricePaise: 80_00,
    status: "active",
  });

  await db.insert(channelAccounts).values({
    id: accountId,
    sellerId,
    marketplace: "amazon",
    status: "pending_auth",
    integrationMode: "api",
    defaultSafetyBuffer: 5,
  });

  return { sellerId, locationId, productId, variantId, accountId };
}

describe("inventory ledger", () => {
  let db: TestDb;

  beforeAll(async () => {
    // Pool ≥10 so concurrency tests actually run in parallel.
    ({ db } = await getTestDb({ packageSuffix: "core", maxConnections: 16 }));
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("receive then sale → correct on_hand", async () => {
    const { sellerId, locationId, variantId } = await seedSeller(db, "recv");

    await recordMovement(db, {
      sellerId,
      variantId,
      locationId,
      quantityDelta: 10,
      reason: "receive",
      sourceType: "manual",
      idempotencyKey: `recv:${variantId}:1`,
    });

    const sale = await recordMovement(db, {
      sellerId,
      variantId,
      locationId,
      quantityDelta: -3,
      reason: "sale",
      sourceType: "order",
      idempotencyKey: `order_line:${variantId}:line-1`,
    });

    expect(sale.applied).toBe(true);
    expect(sale.level.onHand).toBe(7);
    expect(await getStockLevel(db, sellerId, variantId)).toBe(7);
  });

  it("same idempotency key twice for one seller → applied once", async () => {
    const { sellerId, locationId, variantId } = await seedSeller(db, "idem-one");
    const key = `recv:${variantId}:batch-1`;

    const first = await recordMovement(db, {
      sellerId,
      variantId,
      locationId,
      quantityDelta: 5,
      reason: "receive",
      sourceType: "manual",
      idempotencyKey: key,
    });
    const second = await recordMovement(db, {
      sellerId,
      variantId,
      locationId,
      quantityDelta: 5,
      reason: "receive",
      sourceType: "manual",
      idempotencyKey: key,
    });

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(second.movement.id).toBe(first.movement.id);
    expect(second.level.onHand).toBe(5);

    const rows = await db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.sellerId, sellerId));
    expect(rows).toHaveLength(1);
  });

  it("exact idempotent retry → applied: false", async () => {
    const { sellerId, locationId, variantId } = await seedSeller(db, "idem-retry");
    const key = `recv:${variantId}:exact-retry`;
    const payload = {
      sellerId,
      variantId,
      locationId,
      quantityDelta: 8,
      reason: "receive" as const,
      sourceType: "manual",
      idempotencyKey: key,
    };

    const first = await recordMovement(db, payload);
    const retry = await recordMovement(db, payload);

    expect(first.applied).toBe(true);
    expect(retry.applied).toBe(false);
    expect(retry.movement.id).toBe(first.movement.id);
    expect(await getStockLevel(db, sellerId, variantId)).toBe(8);
  });

  it("same key, different quantity → IdempotencyConflictError and writes nothing", async () => {
    const { sellerId, locationId, variantId } = await seedSeller(db, "idem-conflict");
    const key = `recv:${variantId}:conflict-qty`;

    await recordMovement(db, {
      sellerId,
      variantId,
      locationId,
      quantityDelta: 5,
      reason: "receive",
      sourceType: "manual",
      idempotencyKey: key,
    });

    await expect(
      recordMovement(db, {
        sellerId,
        variantId,
        locationId,
        quantityDelta: 9,
        reason: "receive",
        sourceType: "manual",
        idempotencyKey: key,
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);

    const rows = await db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.sellerId, sellerId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.quantityDelta).toBe(5);
    expect(await getStockLevel(db, sellerId, variantId)).toBe(5);
  });

  it("same idempotency key for two different sellers → both applied", async () => {
    const a = await seedSeller(db, "idem-a");
    const b = await seedSeller(db, "idem-b");
    const key = "recv:shared-scope:batch-9";

    const ra = await recordMovement(db, {
      sellerId: a.sellerId,
      variantId: a.variantId,
      locationId: a.locationId,
      quantityDelta: 4,
      reason: "receive",
      sourceType: "manual",
      idempotencyKey: key,
    });
    const rb = await recordMovement(db, {
      sellerId: b.sellerId,
      variantId: b.variantId,
      locationId: b.locationId,
      quantityDelta: 7,
      reason: "receive",
      sourceType: "manual",
      idempotencyKey: key,
    });

    expect(ra.applied).toBe(true);
    expect(rb.applied).toBe(true);
    expect(ra.level.onHand).toBe(4);
    expect(rb.level.onHand).toBe(7);
  });

  it("malformed idempotency key → InvalidMovementError", async () => {
    const { sellerId, locationId, variantId } = await seedSeller(db, "bad-key");

    await expect(
      recordMovement(db, {
        sellerId,
        variantId,
        locationId,
        quantityDelta: 1,
        reason: "receive",
        sourceType: "manual",
        idempotencyKey: "not-enough-parts",
      }),
    ).rejects.toBeInstanceOf(InvalidMovementError);

    await expect(
      recordMovement(db, {
        sellerId,
        variantId,
        locationId,
        quantityDelta: 1,
        reason: "receive",
        sourceType: "manual",
        idempotencyKey: "a::c",
      }),
    ).rejects.toBeInstanceOf(InvalidMovementError);
  });

  it("negative adjustment below zero → InsufficientStockError and no movement row", async () => {
    const { sellerId, locationId, variantId } = await seedSeller(db, "adj");

    await recordMovement(db, {
      sellerId,
      variantId,
      locationId,
      quantityDelta: 2,
      reason: "receive",
      sourceType: "manual",
      idempotencyKey: `recv:${variantId}:1`,
    });

    await expect(
      recordMovement(db, {
        sellerId,
        variantId,
        locationId,
        quantityDelta: -5,
        reason: "adjustment",
        sourceType: "manual",
        idempotencyKey: `adj:${variantId}:1`,
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    const movements = await db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.reason, "adjustment"));
    expect(movements).toHaveLength(0);
    expect(await getStockLevel(db, sellerId, variantId)).toBe(2);
  });

  it("sale below zero → allowed, negativeStock: true", async () => {
    const { sellerId, locationId, variantId } = await seedSeller(db, "neg-sale");

    await recordMovement(db, {
      sellerId,
      variantId,
      locationId,
      quantityDelta: 1,
      reason: "receive",
      sourceType: "manual",
      idempotencyKey: `recv:${variantId}:1`,
    });

    const result = await recordMovement(db, {
      sellerId,
      variantId,
      locationId,
      quantityDelta: -5,
      reason: "sale",
      sourceType: "order",
      idempotencyKey: `order_line:${variantId}:over`,
    });

    expect(result.applied).toBe(true);
    expect(result.negativeStock).toBe(true);
    expect(result.level.onHand).toBe(-4);
  });

  it("sale with a positive delta → InvalidMovementError", async () => {
    const { sellerId, locationId, variantId } = await seedSeller(db, "sale-pos");

    await expect(
      recordMovement(db, {
        sellerId,
        variantId,
        locationId,
        quantityDelta: 1,
        reason: "sale",
        sourceType: "order",
        idempotencyKey: `order_line:${variantId}:bad`,
      }),
    ).rejects.toBeInstanceOf(InvalidMovementError);
  });

  it("DB backstop rejects a bad movement inserted via raw SQL", async () => {
    const { sellerId, locationId, variantId } = await seedSeller(db, "db-check");

    await expect(
      db.insert(inventoryMovements).values({
        id: newId(),
        sellerId,
        variantId,
        locationId,
        quantityDelta: 5,
        reason: "sale",
        sourceType: "order",
        idempotencyKey: `order_line:${variantId}:raw-bad`,
      }),
    ).rejects.toSatisfy((err: unknown) => {
      let current: unknown = err;
      for (let i = 0; i < 5 && current && typeof current === "object"; i++) {
        if (
          "code" in current &&
          (current as { code: unknown }).code === "23514"
        ) {
          return true;
        }
        current =
          "cause" in current ? (current as { cause: unknown }).cause : undefined;
      }
      return false;
    });
  });

  it("tenant mismatch (seller B location with seller A variant) → TenantMismatchError", async () => {
    const a = await seedSeller(db, "ten-a");
    const b = await seedSeller(db, "ten-b");

    await expect(
      recordMovement(db, {
        sellerId: a.sellerId,
        variantId: a.variantId,
        locationId: b.locationId,
        quantityDelta: 1,
        reason: "receive",
        sourceType: "manual",
        idempotencyKey: `recv:${a.variantId}:x`,
      }),
    ).rejects.toBeInstanceOf(TenantMismatchError);
  });

  it("rethrows transient DB errors (e.g. deadlock 40P01) as-is, not InvalidMovementError", async () => {
    const deadlock = Object.assign(new Error("deadlock detected"), { code: "40P01" });
    const fakeDb = {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          query: {
            variants: {
              findFirst: async () => {
                throw deadlock;
              },
            },
          },
        };
        return fn(tx);
      },
    } as unknown as Db;

    const variantId = newId();

    try {
      await recordMovement(fakeDb, {
        sellerId: newId(),
        variantId,
        locationId: newId(),
        quantityDelta: 1,
        reason: "receive",
        sourceType: "manual",
        idempotencyKey: `recv:${variantId}:1`,
      });
      expect.fail("expected deadlock to be rethrown");
    } catch (err) {
      expect(err).toBe(deadlock);
      expect(err).not.toBeInstanceOf(InvalidMovementError);
      expect(err).not.toBeInstanceOf(TenantMismatchError);
    }
  });

  it("CONCURRENCY: 50 sales of 1 against stock of 50 → on_hand 0, 50 rows, version +50", async () => {
    const { sellerId, locationId, variantId } = await seedSeller(db, "conc-sale");

    const initial = await recordMovement(db, {
      sellerId,
      variantId,
      locationId,
      quantityDelta: 50,
      reason: "initial",
      sourceType: "system",
      idempotencyKey: `seed:${variantId}:initial`,
    });
    expect(initial.level.version).toBe(1);

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        recordMovement(db, {
          sellerId,
          variantId,
          locationId,
          quantityDelta: -1,
          reason: "sale",
          sourceType: "order",
          idempotencyKey: `order_line:${variantId}:sale-${i}`,
        }),
      ),
    );

    expect(results.every((r) => r.applied)).toBe(true);
    expect(await getStockLevel(db, sellerId, variantId)).toBe(0);

    const sales = await db
      .select()
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.sellerId, sellerId),
          eq(inventoryMovements.reason, "sale"),
        ),
      );
    expect(sales).toHaveLength(50);

    const [level] = await db
      .select()
      .from(inventoryLevels)
      .where(
        and(
          eq(inventoryLevels.variantId, variantId),
          eq(inventoryLevels.locationId, locationId),
        ),
      );
    expect(level?.onHand).toBe(0);
    expect(level?.version).toBe(51); // 1 initial + 50 sales
  });

  it("CONCURRENCY: 20 calls with the SAME idempotency key → one applied", async () => {
    const { sellerId, locationId, variantId } = await seedSeller(db, "conc-idem");
    const key = `recv:${variantId}:same`;

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        recordMovement(db, {
          sellerId,
          variantId,
          locationId,
          quantityDelta: 10,
          reason: "receive",
          sourceType: "manual",
          idempotencyKey: key,
        }),
      ),
    );

    expect(results.filter((r) => r.applied)).toHaveLength(1);
    expect(results.filter((r) => !r.applied)).toHaveLength(19);

    const rows = await db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.sellerId, sellerId));
    expect(rows).toHaveLength(1);
    expect(await getStockLevel(db, sellerId, variantId)).toBe(10);
  });

  it("CONCURRENCY: first-ever level from 10 parallel calls → correct total", async () => {
    const { sellerId, locationId, variantId } = await seedSeller(db, "conc-first");

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        recordMovement(db, {
          sellerId,
          variantId,
          locationId,
          quantityDelta: 3,
          reason: "receive",
          sourceType: "manual",
          idempotencyKey: `recv:${variantId}:p-${i}`,
        }),
      ),
    );

    expect(results.every((r) => r.applied)).toBe(true);
    expect(await getStockLevel(db, sellerId, variantId)).toBe(30);

    const [level] = await db
      .select()
      .from(inventoryLevels)
      .where(
        and(
          eq(inventoryLevels.variantId, variantId),
          eq(inventoryLevels.locationId, locationId),
        ),
      );
    expect(level?.onHand).toBe(30);
    expect(level?.version).toBe(10);
  });

  it("rebuildLevelsFromLedger fixes a corrupted level and reports it", async () => {
    const { sellerId, locationId, variantId } = await seedSeller(db, "rebuild");

    await recordMovement(db, {
      sellerId,
      variantId,
      locationId,
      quantityDelta: 20,
      reason: "receive",
      sourceType: "manual",
      idempotencyKey: `recv:${variantId}:1`,
    });

    await db
      .update(inventoryLevels)
      .set({ onHand: 999 })
      .where(
        and(
          eq(inventoryLevels.variantId, variantId),
          eq(inventoryLevels.locationId, locationId),
        ),
      );

    const disagreed = await rebuildLevelsFromLedger(db, sellerId);
    expect(disagreed).toHaveLength(1);
    expect(disagreed[0]?.previousOnHand).toBe(999);
    expect(disagreed[0]?.onHand).toBe(20);
    expect(await getStockLevel(db, sellerId, variantId)).toBe(20);

    const again = await rebuildLevelsFromLedger(db, sellerId);
    expect(again).toHaveLength(0);
  });

  it("safety buffer: override beats account default; result never negative", async () => {
    const { sellerId, locationId, variantId, accountId } = await seedSeller(
      db,
      "buffer",
    );

    await recordMovement(db, {
      sellerId,
      variantId,
      locationId,
      quantityDelta: 10,
      reason: "receive",
      sourceType: "manual",
      idempotencyKey: `recv:${variantId}:1`,
    });

    const listingDefault = newId();
    await db.insert(channelListings).values({
      id: listingDefault,
      sellerId,
      variantId,
      channelAccountId: accountId,
      status: "draft",
      // no override → account defaultSafetyBuffer = 5
    });

    expect(await getAvailableForChannel(db, sellerId, variantId, listingDefault)).toBe(
      5,
    );

    const listingOverride = newId();
    // Unique (variantId, channelAccountId) — need a second account for second listing
    const account2 = newId();
    await db.insert(channelAccounts).values({
      id: account2,
      sellerId,
      marketplace: "flipkart",
      status: "pending_auth",
      integrationMode: "api",
      defaultSafetyBuffer: 5,
    });
    await db.insert(channelListings).values({
      id: listingOverride,
      sellerId,
      variantId,
      channelAccountId: account2,
      status: "draft",
      safetyBufferOverride: 2,
    });

    expect(
      await getAvailableForChannel(db, sellerId, variantId, listingOverride),
    ).toBe(8);

    // Buffer larger than on_hand → 0, never negative
    await db
      .update(channelListings)
      .set({ safetyBufferOverride: 100 })
      .where(eq(channelListings.id, listingOverride));

    expect(
      await getAvailableForChannel(db, sellerId, variantId, listingOverride),
    ).toBe(0);
  });
});
