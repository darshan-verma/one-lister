import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { variants } from "./catalog.js";
import { channelAccounts } from "./channels.js";
import {
  marketplaceEnum,
  orderStatusEnum,
  returnStatusEnum,
} from "./enums.js";
import { timestamps } from "./helpers.js";
import { sellers } from "./sellers.js";

/**
 * Marketplace order header.
 * IMPORTANT: `payload` must have buyer PII (name, address, phone, email) stripped
 * before storage. Do not add any buyer PII columns.
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    channelAccountId: uuid("channel_account_id").notNull(),
    marketplace: marketplaceEnum("marketplace").notNull(),
    externalOrderId: text("external_order_id").notNull(),
    status: orderStatusEnum("status").notNull(),
    rawStatus: text("raw_status").notNull(),
    orderedAt: timestamp("ordered_at", { withTimezone: true }).notNull(),
    totalPaise: bigint("total_paise", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("INR"),
    /** Must not contain buyer PII — strip before insert. */
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [
    unique("orders_id_seller_uidx").on(t.id, t.sellerId),
    foreignKey({
      name: "orders_account_seller_fk",
      columns: [t.channelAccountId, t.sellerId],
      foreignColumns: [channelAccounts.id, channelAccounts.sellerId],
    }).onDelete("restrict"),
    unique("orders_channel_account_external_order_unique").on(
      t.channelAccountId,
      t.externalOrderId,
    ),
    index("orders_seller_id_ordered_at_idx").on(t.sellerId, t.orderedAt.desc()),
    check("orders_total_paise_nonneg", sql`${t.totalPaise} >= 0`),
  ],
);

export const orderLines = pgTable(
  "order_lines",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    orderId: uuid("order_id").notNull(),
    externalLineId: text("external_line_id").notNull(),
    externalSku: text("external_sku").notNull(),
    /** Null means the marketplace SKU is not mapped to a local variant yet. */
    variantId: uuid("variant_id"),
    quantity: integer("quantity").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(),
    status: orderStatusEnum("status").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("order_lines_id_seller_uidx").on(t.id, t.sellerId),
    foreignKey({
      name: "ol_order_seller_fk",
      columns: [t.orderId, t.sellerId],
      foreignColumns: [orders.id, orders.sellerId],
    }).onDelete("restrict"),
    foreignKey({
      name: "ol_variant_seller_fk",
      columns: [t.variantId, t.sellerId],
      foreignColumns: [variants.id, variants.sellerId],
    }).onDelete("restrict"),
    index("order_lines_seller_id_idx").on(t.sellerId),
    unique("order_lines_order_external_line_unique").on(t.orderId, t.externalLineId),
    index("order_lines_variant_id_idx").on(t.variantId),
    check("order_lines_quantity_positive", sql`${t.quantity} > 0`),
    check("order_lines_unit_price_nonneg", sql`${t.unitPricePaise} >= 0`),
  ],
);

/**
 * Marketplace return. order_id may be null when the return arrives before the
 * order has been ingested; external_order_id always carries the marketplace id.
 */
export const returns = pgTable(
  "returns",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    channelAccountId: uuid("channel_account_id").notNull(),
    orderId: uuid("order_id"),
    orderLineId: uuid("order_line_id"),
    externalOrderId: text("external_order_id").notNull(),
    externalReturnId: text("external_return_id").notNull(),
    status: returnStatusEnum("status").notNull(),
    quantity: integer("quantity").notNull(),
    reason: text("reason"),
    restocked: boolean("restocked").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "ret_account_seller_fk",
      columns: [t.channelAccountId, t.sellerId],
      foreignColumns: [channelAccounts.id, channelAccounts.sellerId],
    }).onDelete("restrict"),
    foreignKey({
      name: "ret_order_seller_fk",
      columns: [t.orderId, t.sellerId],
      foreignColumns: [orders.id, orders.sellerId],
    }).onDelete("restrict"),
    foreignKey({
      name: "ret_line_seller_fk",
      columns: [t.orderLineId, t.sellerId],
      foreignColumns: [orderLines.id, orderLines.sellerId],
    }).onDelete("restrict"),
    index("returns_seller_id_idx").on(t.sellerId),
    unique("returns_channel_account_external_return_unique").on(
      t.channelAccountId,
      t.externalReturnId,
    ),
    index("returns_channel_account_external_order_idx").on(
      t.channelAccountId,
      t.externalOrderId,
    ),
    index("returns_order_id_idx").on(t.orderId),
    index("returns_order_line_id_idx").on(t.orderLineId),
    check("returns_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderLine = typeof orderLines.$inferSelect;
export type NewOrderLine = typeof orderLines.$inferInsert;
export type Return = typeof returns.$inferSelect;
export type NewReturn = typeof returns.$inferInsert;
