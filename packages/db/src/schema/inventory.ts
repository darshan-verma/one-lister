import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { variants } from "./catalog.js";
import { movementReasonEnum } from "./enums.js";
import { sellers, stockLocations } from "./sellers.js";

/**
 * Append-only inventory ledger. Never update or delete rows.
 * Current balances live in inventory_levels and are only written inside the ledger transaction.
 *
 * idempotency_key format: "<kind>:<scope id>:<external id>",
 * e.g. order_line:<channelAccountId>:<externalLineId>.
 * Uniqueness is scoped per seller.
 */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").notNull(),
    locationId: uuid("location_id").notNull(),
    quantityDelta: integer("quantity_delta").notNull(),
    reason: movementReasonEnum("reason").notNull(),
    /** manual | order | return | import | system */
    sourceType: text("source_type").notNull(),
    sourceRef: text("source_ref"),
    /**
     * Format: "<kind>:<scope id>:<external id>",
     * e.g. order_line:<channelAccountId>:<externalLineId>.
     */
    idempotencyKey: text("idempotency_key").notNull(),
    note: text("note"),
    /** Placeholder until users table exists. */
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "im_variant_seller_fk",
      columns: [t.variantId, t.sellerId],
      foreignColumns: [variants.id, variants.sellerId],
    }).onDelete("restrict"),
    foreignKey({
      name: "im_location_seller_fk",
      columns: [t.locationId, t.sellerId],
      foreignColumns: [stockLocations.id, stockLocations.sellerId],
    }).onDelete("restrict"),
    unique("inventory_movements_seller_idempotency_unique").on(
      t.sellerId,
      t.idempotencyKey,
    ),
    index("inventory_movements_seller_id_idx").on(t.sellerId),
    index("inventory_movements_variant_location_created_at_idx").on(
      t.variantId,
      t.locationId,
      t.createdAt,
    ),
    index("inventory_movements_location_id_idx").on(t.locationId),
    check(
      "inventory_movements_quantity_delta_by_reason",
      sql`(
        (
          ${t.reason} in ('initial', 'receive', 'transfer_in', 'return_restock', 'cancellation')
          and ${t.quantityDelta} > 0
        )
        or (
          ${t.reason} in ('sale', 'transfer_out')
          and ${t.quantityDelta} < 0
        )
        or (
          ${t.reason} = 'adjustment'
          and ${t.quantityDelta} <> 0
        )
      )`,
    ),
  ],
);

/**
 * Derived from inventory_movements; only written inside the ledger transaction.
 * Do not update on_hand outside the ledger path.
 */
export const inventoryLevels = pgTable(
  "inventory_levels",
  {
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").notNull(),
    locationId: uuid("location_id").notNull(),
    onHand: integer("on_hand").notNull().default(0),
    version: integer("version").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.variantId, t.locationId] }),
    foreignKey({
      name: "il_variant_seller_fk",
      columns: [t.variantId, t.sellerId],
      foreignColumns: [variants.id, variants.sellerId],
    }).onDelete("restrict"),
    foreignKey({
      name: "il_location_seller_fk",
      columns: [t.locationId, t.sellerId],
      foreignColumns: [stockLocations.id, stockLocations.sellerId],
    }).onDelete("restrict"),
    index("inventory_levels_seller_id_idx").on(t.sellerId),
    index("inventory_levels_location_id_idx").on(t.locationId),
  ],
);

export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type NewInventoryMovement = typeof inventoryMovements.$inferInsert;
export type InventoryLevel = typeof inventoryLevels.$inferSelect;
export type NewInventoryLevel = typeof inventoryLevels.$inferInsert;
