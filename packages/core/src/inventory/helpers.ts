import {
  channelAccounts,
  channelListings,
  inventoryLevels,
  inventoryMovements,
  type Db,
} from "@one-lister/db";
import { and, eq, sql } from "drizzle-orm";

import { TenantMismatchError } from "../errors.js";
import type { RebuiltLevelDisagreement } from "./types.js";

/** Sum of on_hand across all locations for a seller's variant. */
export async function getStockLevel(
  db: Db,
  sellerId: string,
  variantId: string,
): Promise<number> {
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${inventoryLevels.onHand}), 0)::int`,
    })
    .from(inventoryLevels)
    .where(
      and(
        eq(inventoryLevels.sellerId, sellerId),
        eq(inventoryLevels.variantId, variantId),
      ),
    );

  return Number(rows[0]?.total ?? 0);
}

/**
 * Channel-available quantity: max(0, on_hand - buffer), where buffer is the
 * listing override or the channel account default.
 */
export async function getAvailableForChannel(
  db: Db,
  sellerId: string,
  variantId: string,
  channelListingId: string,
): Promise<number> {
  const listing = await db.query.channelListings.findFirst({
    where: and(
      eq(channelListings.id, channelListingId),
      eq(channelListings.sellerId, sellerId),
    ),
  });

  if (!listing) {
    throw new TenantMismatchError("channel listing does not belong to seller", {
      sellerId,
      channelListingId,
      resource: "listing",
    });
  }

  if (listing.variantId !== variantId) {
    throw new TenantMismatchError("channel listing does not belong to variant", {
      sellerId,
      variantId,
      channelListingId,
      resource: "listing",
    });
  }

  const account = await db.query.channelAccounts.findFirst({
    where: and(
      eq(channelAccounts.id, listing.channelAccountId),
      eq(channelAccounts.sellerId, sellerId),
    ),
    columns: { defaultSafetyBuffer: true },
  });

  if (!account) {
    throw new TenantMismatchError("channel account does not belong to seller", {
      sellerId,
      channelListingId,
      resource: "listing",
    });
  }

  const onHand = await getStockLevel(db, sellerId, variantId);
  const buffer = listing.safetyBufferOverride ?? account.defaultSafetyBuffer;
  return Math.max(0, onHand - buffer);
}

/**
 * Repair tool: recompute inventory_levels from the ledger for one seller.
 * Returns rows whose cached on_hand disagreed with the sum of movements.
 */
export async function rebuildLevelsFromLedger(
  db: Db,
  sellerId: string,
): Promise<RebuiltLevelDisagreement[]> {
  return db.transaction(async (tx) => {
    const sums = await tx
      .select({
        variantId: inventoryMovements.variantId,
        locationId: inventoryMovements.locationId,
        total: sql<number>`coalesce(sum(${inventoryMovements.quantityDelta}), 0)::int`,
      })
      .from(inventoryMovements)
      .where(eq(inventoryMovements.sellerId, sellerId))
      .groupBy(inventoryMovements.variantId, inventoryMovements.locationId);

    const existing = await tx
      .select()
      .from(inventoryLevels)
      .where(eq(inventoryLevels.sellerId, sellerId));

    const existingByKey = new Map(
      existing.map((row) => [`${row.variantId}:${row.locationId}`, row]),
    );

    const disagreed: RebuiltLevelDisagreement[] = [];
    const seenKeys = new Set<string>();

    for (const sum of sums) {
      const key = `${sum.variantId}:${sum.locationId}`;
      seenKeys.add(key);
      const total = Number(sum.total);
      const current = existingByKey.get(key);

      if (current && current.onHand === total) {
        continue;
      }

      const previousOnHand = current?.onHand ?? null;
      const previousVersion = current?.version ?? null;
      const nextVersion = (current?.version ?? 0) + 1;

      if (current) {
        await tx
          .update(inventoryLevels)
          .set({
            onHand: total,
            version: nextVersion,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(inventoryLevels.variantId, sum.variantId),
              eq(inventoryLevels.locationId, sum.locationId),
            ),
          );
      } else {
        await tx.insert(inventoryLevels).values({
          sellerId,
          variantId: sum.variantId,
          locationId: sum.locationId,
          onHand: total,
          version: nextVersion,
          updatedAt: new Date(),
        });
      }

      disagreed.push({
        sellerId,
        variantId: sum.variantId,
        locationId: sum.locationId,
        previousOnHand,
        onHand: total,
        previousVersion,
        version: nextVersion,
      });
    }

    // Levels with no movements should be zero.
    for (const row of existing) {
      const key = `${row.variantId}:${row.locationId}`;
      if (seenKeys.has(key)) {
        continue;
      }
      if (row.onHand === 0) {
        continue;
      }

      const nextVersion = row.version + 1;
      await tx
        .update(inventoryLevels)
        .set({
          onHand: 0,
          version: nextVersion,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(inventoryLevels.variantId, row.variantId),
            eq(inventoryLevels.locationId, row.locationId),
          ),
        );

      disagreed.push({
        sellerId,
        variantId: row.variantId,
        locationId: row.locationId,
        previousOnHand: row.onHand,
        onHand: 0,
        previousVersion: row.version,
        version: nextVersion,
      });
    }

    return disagreed;
  });
}
