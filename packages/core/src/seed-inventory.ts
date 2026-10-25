/**
 * Idempotent inventory seed: gives every variant initial stock via the ledger.
 * Safe to re-run — uses idempotency key `seed:<variantId>:initial`.
 */
import { and, eq } from "drizzle-orm";

import { createDb, stockLocations, variants } from "@one-lister/db";

import { recordMovement } from "./inventory/record-movement.js";

const INITIAL_UNITS = 100;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required (set in root .env)");
  }

  const { db, sql } = createDb(databaseUrl);

  try {
    const allVariants = await db.select().from(variants);
    let applied = 0;
    let skipped = 0;

    for (const variant of allVariants) {
      const location = await db.query.stockLocations.findFirst({
        where: and(
          eq(stockLocations.sellerId, variant.sellerId),
          eq(stockLocations.isDefault, true),
        ),
      });

      if (!location) {
        console.warn(
          `Skipping variant ${variant.sku}: no default stock location for seller ${variant.sellerId}`,
        );
        continue;
      }

      const result = await recordMovement(db, {
        sellerId: variant.sellerId,
        variantId: variant.id,
        locationId: location.id,
        quantityDelta: INITIAL_UNITS,
        reason: "initial",
        sourceType: "system",
        idempotencyKey: `seed:${variant.id}:initial`,
        note: "demo seed stock",
      });

      if (result.applied) {
        applied += 1;
        console.log(`Seeded ${INITIAL_UNITS} units for ${variant.sku}`);
      } else {
        skipped += 1;
        console.log(`Already seeded ${variant.sku} (on_hand=${result.level.onHand})`);
      }
    }

    console.log(`Inventory seed complete. applied=${applied} skipped=${skipped}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
