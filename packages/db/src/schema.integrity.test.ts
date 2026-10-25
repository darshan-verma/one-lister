import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { newId } from "./id.js";
import {
  channelAccounts,
  channelListings,
  inventoryMovements,
  orderLines,
  orders,
  products,
  sellers,
  stockLocations,
  variants,
} from "./schema/index.js";
import { closeTestDb, getTestDb, resetTestDb, type TestDb } from "./test/harness.js";

function findPgCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let i = 0; i < 5 && current && typeof current === "object"; i++) {
    if ("code" in current && typeof (current as { code: unknown }).code === "string") {
      const code = (current as { code: string }).code;
      // Postgres SQLSTATE is five chars (e.g. 23503); skip unrelated codes.
      if (/^\d{5}$/.test(code)) {
        return code;
      }
    }
    current = "cause" in current ? (current as { cause: unknown }).cause : undefined;
  }
  return undefined;
}

async function expectPgRejects(
  action: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await action();
    expect.fail(`expected Postgres error ${code}`);
  } catch (err) {
    const got = findPgCode(err);
    expect(got, `got ${String(err)}`).toBe(code);
  }
}

async function seedSellerGraph(db: TestDb, label: string) {
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
  });

  return { sellerId, locationId, productId, variantId, accountId };
}

describe("schema integrity", () => {
  let db: TestDb;

  beforeAll(async () => {
    ({ db } = await getTestDb({ packageSuffix: "db" }));
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("rejects a channel_listing linking seller A variant to seller B channel_account", async () => {
    const a = await seedSellerGraph(db, "A");
    const b = await seedSellerGraph(db, "B");

    await expectPgRejects(
      () =>
        db.insert(channelListings).values({
          id: newId(),
          sellerId: a.sellerId,
          variantId: a.variantId,
          channelAccountId: b.accountId,
          status: "draft",
        }),
      "23503",
    );
  });

  it("rejects inventory_movement with reason sale and positive delta", async () => {
    const a = await seedSellerGraph(db, "A");

    await expectPgRejects(
      () =>
        db.insert(inventoryMovements).values({
          id: newId(),
          sellerId: a.sellerId,
          variantId: a.variantId,
          locationId: a.locationId,
          quantityDelta: 1,
          reason: "sale",
          sourceType: "manual",
          idempotencyKey: "sale:bad:1",
        }),
      "23514",
    );
  });

  it("rejects receive movement with negative delta", async () => {
    const a = await seedSellerGraph(db, "A");

    await expectPgRejects(
      () =>
        db.insert(inventoryMovements).values({
          id: newId(),
          sellerId: a.sellerId,
          variantId: a.variantId,
          locationId: a.locationId,
          quantityDelta: -5,
          reason: "receive",
          sourceType: "manual",
          idempotencyKey: "receive:bad:1",
        }),
      "23514",
    );
  });

  it("rejects duplicate idempotency_key for one seller and accepts across sellers", async () => {
    const a = await seedSellerGraph(db, "A");
    const b = await seedSellerGraph(db, "B");
    const key = "order_line:acct:line-1";

    await db.insert(inventoryMovements).values({
      id: newId(),
      sellerId: a.sellerId,
      variantId: a.variantId,
      locationId: a.locationId,
      quantityDelta: -1,
      reason: "sale",
      sourceType: "order",
      idempotencyKey: key,
    });

    await expectPgRejects(
      () =>
        db.insert(inventoryMovements).values({
          id: newId(),
          sellerId: a.sellerId,
          variantId: a.variantId,
          locationId: a.locationId,
          quantityDelta: -1,
          reason: "sale",
          sourceType: "order",
          idempotencyKey: key,
        }),
      "23505",
    );

    await db.insert(inventoryMovements).values({
      id: newId(),
      sellerId: b.sellerId,
      variantId: b.variantId,
      locationId: b.locationId,
      quantityDelta: -1,
      reason: "sale",
      sourceType: "order",
      idempotencyKey: key,
    });
  });

  it("rejects a second pending Amazon account for the same seller", async () => {
    const a = await seedSellerGraph(db, "A");

    await expectPgRejects(
      () =>
        db.insert(channelAccounts).values({
          id: newId(),
          sellerId: a.sellerId,
          marketplace: "amazon",
          status: "pending_auth",
          integrationMode: "api",
        }),
      "23505",
    );
  });

  it("rejects order_lines.quantity = 0", async () => {
    const a = await seedSellerGraph(db, "A");
    const orderId = newId();

    await db.insert(orders).values({
      id: orderId,
      sellerId: a.sellerId,
      channelAccountId: a.accountId,
      marketplace: "amazon",
      externalOrderId: "AMZ-1",
      status: "created",
      rawStatus: "Pending",
      orderedAt: new Date(),
      totalPaise: 0,
    });

    await expectPgRejects(
      () =>
        db.insert(orderLines).values({
          id: newId(),
          sellerId: a.sellerId,
          orderId,
          externalLineId: "L1",
          externalSku: "A-SKU-1",
          quantity: 0,
          unitPricePaise: 100,
          status: "created",
        }),
      "23514",
    );
  });
});
