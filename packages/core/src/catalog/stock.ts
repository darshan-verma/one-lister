import {
  inventoryLevels,
  inventoryMovements,
  stockLocations,
  type Db,
  type InventoryMovement,
} from "@one-lister/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { writeAuditEvent } from "../audit/write-audit-event.js";
import { ProductNotFoundError } from "../errors.js";
import {
  getStockLevel,
  recordMovement,
  type RecordMovementResult,
} from "../inventory/index.js";
import { requireVariant } from "./products.js";
import {
  adjustStockInputSchema,
  type AdjustStockInput,
} from "./schemas.js";
import type { CatalogTenantContext } from "./types.js";

async function defaultLocationId(
  db: Db,
  sellerId: string,
): Promise<string> {
  const loc = await db.query.stockLocations.findFirst({
    where: and(
      eq(stockLocations.sellerId, sellerId),
      eq(stockLocations.isDefault, true),
    ),
    columns: { id: true },
  });
  if (!loc) {
    throw new Error("seller has no default stock location");
  }
  return loc.id;
}

export async function setInitialStock(
  db: Db,
  ctx: CatalogTenantContext,
  variantId: string,
  input: {
    quantity: number;
    clientRequestId: string;
    note?: string;
  },
): Promise<RecordMovementResult> {
  const quantity = z.number().int().positive().parse(input.quantity);
  const clientRequestId = z.string().uuid().parse(input.clientRequestId);
  await requireVariant(db, ctx, variantId);
  const locationId = await defaultLocationId(db, ctx.sellerId);

  const result = await recordMovement(db, {
    sellerId: ctx.sellerId,
    variantId,
    locationId,
    quantityDelta: quantity,
    reason: "initial",
    sourceType: "manual",
    idempotencyKey: `ui:${ctx.userId}:${clientRequestId}`,
    note: input.note,
    createdBy: ctx.userId,
  });

  if (result.applied) {
    await writeAuditEvent(db, {
      sellerId: ctx.sellerId,
      actorUserId: ctx.userId,
      action: "stock.initial",
      targetType: "variant",
      targetId: variantId,
      metadata: { quantity },
    });
  }

  return result;
}

export async function adjustStock(
  db: Db,
  ctx: CatalogTenantContext,
  variantId: string,
  rawInput: AdjustStockInput,
): Promise<RecordMovementResult> {
  const input = adjustStockInputSchema.parse(rawInput);
  await requireVariant(db, ctx, variantId);
  const locationId = await defaultLocationId(db, ctx.sellerId);

  if (input.reason === "receive" && input.delta <= 0) {
    throw new Error("receive requires a positive delta");
  }

  const result = await recordMovement(db, {
    sellerId: ctx.sellerId,
    variantId,
    locationId,
    quantityDelta: input.delta,
    reason: input.reason,
    sourceType: "manual",
    idempotencyKey: `ui:${ctx.userId}:${input.clientRequestId}`,
    note: input.note,
    createdBy: ctx.userId,
  });

  if (result.applied) {
    await writeAuditEvent(db, {
      sellerId: ctx.sellerId,
      actorUserId: ctx.userId,
      action: "stock.adjust",
      targetType: "variant",
      targetId: variantId,
      metadata: { delta: input.delta, reason: input.reason },
    });
  }

  return result;
}

export async function getVariantStock(
  db: Db,
  ctx: CatalogTenantContext,
  variantId: string,
): Promise<{ onHand: number; locationId: string }> {
  await requireVariant(db, ctx, variantId);
  const locationId = await defaultLocationId(db, ctx.sellerId);
  const level = await db.query.inventoryLevels.findFirst({
    where: and(
      eq(inventoryLevels.sellerId, ctx.sellerId),
      eq(inventoryLevels.variantId, variantId),
      eq(inventoryLevels.locationId, locationId),
    ),
  });
  const onHand =
    level?.onHand ?? (await getStockLevel(db, ctx.sellerId, variantId));
  return { onHand, locationId };
}

const cursorSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().uuid(),
});

export async function getMovementHistory(
  db: Db,
  ctx: CatalogTenantContext,
  variantId: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<{
  movements: InventoryMovement[];
  nextCursor: string | null;
}> {
  await requireVariant(db, ctx, variantId);
  const limit = Math.min(opts.limit ?? 25, 100);

  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (opts.cursor) {
    try {
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(opts.cursor, "base64url").toString("utf8")),
      );
    } catch {
      throw new ProductNotFoundError("invalid cursor", {
        sellerId: ctx.sellerId,
        variantId,
      });
    }
  }

  const conditions = [
    eq(inventoryMovements.sellerId, ctx.sellerId),
    eq(inventoryMovements.variantId, variantId),
  ];

  if (cursor) {
    const createdAt = new Date(cursor.createdAt);
    conditions.push(
      sql`(${inventoryMovements.createdAt}, ${inventoryMovements.id}) < (${createdAt}, ${cursor.id}::uuid)`,
    );
  }

  const rows = await db
    .select()
    .from(inventoryMovements)
    .where(and(...conditions))
    .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const movements = hasMore ? rows.slice(0, limit) : rows;
  const last = movements[movements.length - 1];
  const nextCursor =
    hasMore && last
      ? Buffer.from(
          JSON.stringify({
            createdAt: last.createdAt.toISOString(),
            id: last.id,
          }),
          "utf8",
        ).toString("base64url")
      : null;

  return { movements, nextCursor };
}
