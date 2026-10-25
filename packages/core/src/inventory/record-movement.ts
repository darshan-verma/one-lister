import {
  inventoryLevels,
  inventoryMovements,
  newId,
  stockLocations,
  variants,
  type Db,
  type InventoryLevel,
} from "@one-lister/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  IdempotencyConflictError,
  InsufficientStockError,
  InvalidMovementError,
  TenantMismatchError,
} from "../errors.js";
import {
  MOVEMENT_REASONS,
  NEGATIVE_ONLY_REASONS,
  POSITIVE_ONLY_REASONS,
  type RecordMovementInput,
  type RecordMovementResult,
} from "./types.js";

const uuidSchema = z.string().uuid();

const recordMovementInputSchema = z.object({
  sellerId: uuidSchema,
  variantId: uuidSchema,
  locationId: uuidSchema,
  quantityDelta: z
    .number()
    .int("quantityDelta must be an integer")
    .refine((n) => n !== 0, "quantityDelta must be non-zero"),
  reason: z.enum(MOVEMENT_REASONS),
  sourceType: z.string().min(1),
  sourceRef: z.string().min(1).optional(),
  idempotencyKey: z
    .string()
    .min(1)
    .refine(isValidIdempotencyKey, {
      message:
        'idempotencyKey must match "<kind>:<scope id>:<external id>" with non-empty parts',
    }),
  note: z.string().optional(),
  createdBy: z.string().optional(),
});

/** "<kind>:<scope id>:<external id>" — at least three non-empty colon-separated parts. */
export function isValidIdempotencyKey(key: string): boolean {
  const parts = key.split(":");
  return parts.length >= 3 && parts.every((part) => part.length > 0);
}

function assertSignForReason(
  reason: RecordMovementInput["reason"],
  quantityDelta: number,
  ctx: Pick<RecordMovementInput, "sellerId" | "variantId" | "locationId">,
): void {
  if (
    (POSITIVE_ONLY_REASONS as readonly string[]).includes(reason) &&
    quantityDelta <= 0
  ) {
    throw new InvalidMovementError(
      `reason "${reason}" requires a positive quantityDelta`,
      { ...ctx, reason, quantityDelta },
    );
  }
  if (
    (NEGATIVE_ONLY_REASONS as readonly string[]).includes(reason) &&
    quantityDelta >= 0
  ) {
    throw new InvalidMovementError(
      `reason "${reason}" requires a negative quantityDelta`,
      { ...ctx, reason, quantityDelta },
    );
  }
}

function findPgCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let i = 0; i < 5 && current && typeof current === "object"; i++) {
    if ("code" in current && typeof (current as { code: unknown }).code === "string") {
      const code = (current as { code: string }).code;
      if (/^\d{5}$/.test(code)) {
        return code;
      }
    }
    current = "cause" in current ? (current as { cause: unknown }).cause : undefined;
  }
  return undefined;
}

function mapDriverError(
  err: unknown,
  ctx: Pick<RecordMovementInput, "sellerId" | "variantId" | "locationId" | "reason">,
): never {
  if (
    err instanceof InsufficientStockError ||
    err instanceof TenantMismatchError ||
    err instanceof InvalidMovementError ||
    err instanceof IdempotencyConflictError
  ) {
    throw err;
  }

  const code = findPgCode(err);
  if (code === "23514") {
    throw new InvalidMovementError("movement rejected by database check constraint", {
      ...ctx,
      cause: "check_violation",
    });
  }
  if (code === "23503") {
    throw new TenantMismatchError(
      "movement rejected by database foreign key (tenant mismatch)",
      { sellerId: ctx.sellerId, variantId: ctx.variantId, locationId: ctx.locationId, resource: "variant" },
    );
  }

  // Transient / unexpected driver errors (deadlock 40P01, serialization 40001,
  // connection loss, etc.) must reach the job layer unchanged so BullMQ can retry.
  throw err;
}

function syntheticZeroLevel(
  input: Pick<RecordMovementInput, "sellerId" | "variantId" | "locationId">,
): InventoryLevel {
  return {
    sellerId: input.sellerId,
    variantId: input.variantId,
    locationId: input.locationId,
    onHand: 0,
    version: 0,
    updatedAt: new Date(0),
  };
}

/**
 * Append a ledger movement and update the cached inventory_levels row
 * in a single transaction. Idempotent per (sellerId, idempotencyKey).
 */
export async function recordMovement(
  db: Db,
  rawInput: RecordMovementInput,
): Promise<RecordMovementResult> {
  const parsed = recordMovementInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new InvalidMovementError(first?.message ?? "invalid movement input", {
      sellerId: rawInput.sellerId,
      variantId: rawInput.variantId,
      locationId: rawInput.locationId,
      reason: rawInput.reason,
      quantityDelta: rawInput.quantityDelta,
      idempotencyKey: rawInput.idempotencyKey,
      cause: "validation",
    });
  }

  const input = parsed.data;
  assertSignForReason(input.reason, input.quantityDelta, input);

  try {
    return await db.transaction(async (tx) => {
      const variant = await tx.query.variants.findFirst({
        where: and(
          eq(variants.id, input.variantId),
          eq(variants.sellerId, input.sellerId),
        ),
        columns: { id: true },
      });
      if (!variant) {
        throw new TenantMismatchError("variant does not belong to seller", {
          sellerId: input.sellerId,
          variantId: input.variantId,
          resource: "variant",
        });
      }

      const location = await tx.query.stockLocations.findFirst({
        where: and(
          eq(stockLocations.id, input.locationId),
          eq(stockLocations.sellerId, input.sellerId),
        ),
        columns: { id: true },
      });
      if (!location) {
        throw new TenantMismatchError("location does not belong to seller", {
          sellerId: input.sellerId,
          locationId: input.locationId,
          resource: "location",
        });
      }

      const movementId = newId();
      const inserted = await tx
        .insert(inventoryMovements)
        .values({
          id: movementId,
          sellerId: input.sellerId,
          variantId: input.variantId,
          locationId: input.locationId,
          quantityDelta: input.quantityDelta,
          reason: input.reason,
          sourceType: input.sourceType,
          sourceRef: input.sourceRef,
          idempotencyKey: input.idempotencyKey,
          note: input.note,
          createdBy: input.createdBy,
        })
        .onConflictDoNothing({
          target: [inventoryMovements.sellerId, inventoryMovements.idempotencyKey],
        })
        .returning();

      if (inserted.length === 0) {
        const existing = await tx.query.inventoryMovements.findFirst({
          where: and(
            eq(inventoryMovements.sellerId, input.sellerId),
            eq(inventoryMovements.idempotencyKey, input.idempotencyKey),
          ),
        });
        if (!existing) {
          throw new InvalidMovementError(
            "idempotent conflict but existing movement not found",
            {
              sellerId: input.sellerId,
              idempotencyKey: input.idempotencyKey,
              cause: "idempotency_race",
            },
          );
        }

        const fieldsMatch =
          existing.variantId === input.variantId &&
          existing.locationId === input.locationId &&
          existing.quantityDelta === input.quantityDelta &&
          existing.reason === input.reason;

        if (!fieldsMatch) {
          throw new IdempotencyConflictError(
            "idempotency key reused with different movement payload",
            {
              sellerId: existing.sellerId,
              idempotencyKey: existing.idempotencyKey,
              variantId: existing.variantId,
              locationId: existing.locationId,
              quantityDelta: existing.quantityDelta,
              reason: existing.reason,
            },
            {
              sellerId: input.sellerId,
              idempotencyKey: input.idempotencyKey,
              variantId: input.variantId,
              locationId: input.locationId,
              quantityDelta: input.quantityDelta,
              reason: input.reason,
            },
          );
        }

        const level =
          (await tx.query.inventoryLevels.findFirst({
            where: and(
              eq(inventoryLevels.variantId, existing.variantId),
              eq(inventoryLevels.locationId, existing.locationId),
            ),
          })) ??
          syntheticZeroLevel({
            sellerId: existing.sellerId,
            variantId: existing.variantId,
            locationId: existing.locationId,
          });

        return {
          applied: false,
          movement: existing,
          level,
          negativeStock: level.onHand < 0,
        };
      }

      const movement = inserted[0]!;

      await tx
        .insert(inventoryLevels)
        .values({
          sellerId: input.sellerId,
          variantId: input.variantId,
          locationId: input.locationId,
          onHand: 0,
          version: 0,
        })
        .onConflictDoNothing({
          target: [inventoryLevels.variantId, inventoryLevels.locationId],
        });

      const locked = await tx
        .select()
        .from(inventoryLevels)
        .where(
          and(
            eq(inventoryLevels.variantId, input.variantId),
            eq(inventoryLevels.locationId, input.locationId),
          ),
        )
        .for("update");

      const current = locked[0];
      if (!current) {
        throw new InvalidMovementError("inventory_levels row missing after ensure", {
          sellerId: input.sellerId,
          variantId: input.variantId,
          locationId: input.locationId,
          cause: "missing_level",
        });
      }

      const newOnHand = current.onHand + input.quantityDelta;

      const blocksNegative =
        input.reason === "transfer_out" ||
        (input.reason === "adjustment" && input.quantityDelta < 0);

      if (blocksNegative && newOnHand < 0) {
        throw new InsufficientStockError(
          `insufficient stock for ${input.reason}: on_hand ${current.onHand}, delta ${input.quantityDelta}`,
          {
            sellerId: input.sellerId,
            variantId: input.variantId,
            locationId: input.locationId,
            onHand: current.onHand,
            quantityDelta: input.quantityDelta,
            reason: input.reason,
          },
        );
      }

      const updatedRows = await tx
        .update(inventoryLevels)
        .set({
          onHand: newOnHand,
          version: current.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(inventoryLevels.variantId, input.variantId),
            eq(inventoryLevels.locationId, input.locationId),
          ),
        )
        .returning();

      const level = updatedRows[0]!;

      return {
        applied: true,
        movement,
        level,
        negativeStock: level.onHand < 0,
      };
    });
  } catch (err) {
    mapDriverError(err, {
      sellerId: input.sellerId,
      variantId: input.variantId,
      locationId: input.locationId,
      reason: input.reason,
    });
  }
}
