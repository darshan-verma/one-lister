import {
  bigint,
  boolean,
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
    channelAccountId: uuid("channel_account_id")
      .notNull()
      .references(() => channelAccounts.id, { onDelete: "restrict" }),
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
    unique("orders_channel_account_external_order_unique").on(
      t.channelAccountId,
      t.externalOrderId,
    ),
    index("orders_seller_id_ordered_at_idx").on(t.sellerId, t.orderedAt.desc()),
  ],
);

export const orderLines = pgTable(
  "order_lines",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    externalLineId: text("external_line_id").notNull(),
    externalSku: text("external_sku").notNull(),
    /** Null means the marketplace SKU is not mapped to a local variant yet. */
    variantId: uuid("variant_id").references(() => variants.id, {
      onDelete: "restrict",
    }),
    quantity: integer("quantity").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(),
    status: orderStatusEnum("status").notNull(),
    ...timestamps,
  },
  (t) => [
    index("order_lines_seller_id_idx").on(t.sellerId),
    unique("order_lines_order_external_line_unique").on(t.orderId, t.externalLineId),
    index("order_lines_variant_id_idx").on(t.variantId),
  ],
);

export const returns = pgTable(
  "returns",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    channelAccountId: uuid("channel_account_id")
      .notNull()
      .references(() => channelAccounts.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    orderLineId: uuid("order_line_id").references(() => orderLines.id, {
      onDelete: "restrict",
    }),
    externalReturnId: text("external_return_id").notNull(),
    status: returnStatusEnum("status").notNull(),
    quantity: integer("quantity").notNull(),
    reason: text("reason"),
    restocked: boolean("restocked").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("returns_seller_id_idx").on(t.sellerId),
    unique("returns_channel_account_external_return_unique").on(
      t.channelAccountId,
      t.externalReturnId,
    ),
  ],
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderLine = typeof orderLines.$inferSelect;
export type NewOrderLine = typeof orderLines.$inferInsert;
export type Return = typeof returns.$inferSelect;
export type NewReturn = typeof returns.$inferInsert;
