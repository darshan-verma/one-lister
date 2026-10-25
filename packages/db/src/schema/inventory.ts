import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { variants } from "./catalog.js";
import { movementReasonEnum } from "./enums.js";
import { sellers, stockLocations } from "./sellers.js";

/**
 * Append-only inventory ledger. Never update or delete rows.
 * Current balances live in inventory_levels and are only written inside the ledger transaction.
 */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "restrict" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => stockLocations.id, { onDelete: "restrict" }),
    quantityDelta: integer("quantity_delta").notNull(),
    reason: movementReasonEnum("reason").notNull(),
    /** manual | order | return | import | system */
    sourceType: text("source_type").notNull(),
    sourceRef: text("source_ref"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    note: text("note"),
    /** Placeholder until users table exists. */
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inventory_movements_seller_id_idx").on(t.sellerId),
    index("inventory_movements_variant_location_created_at_idx").on(
      t.variantId,
      t.locationId,
      t.createdAt,
    ),
    check(
      "inventory_movements_quantity_delta_nonzero",
      sql`${t.quantityDelta} <> 0`,
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
    variantId: uuid("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "restrict" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => stockLocations.id, { onDelete: "restrict" }),
    onHand: integer("on_hand").notNull().default(0),
    version: integer("version").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.variantId, t.locationId] }),
    index("inventory_levels_seller_id_idx").on(t.sellerId),
  ],
);

export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type NewInventoryMovement = typeof inventoryMovements.$inferInsert;
export type InventoryLevel = typeof inventoryLevels.$inferSelect;
export type NewInventoryLevel = typeof inventoryLevels.$inferInsert;
