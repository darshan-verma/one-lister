import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { sellerStatusEnum } from "./enums.js";
import { timestamps } from "./helpers.js";

export const sellers = pgTable("sellers", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name").notNull(),
  legalName: text("legal_name").notNull(),
  gstin: text("gstin"),
  status: sellerStatusEnum("status").notNull().default("active"),
  ...timestamps,
});

export const stockLocations = pgTable(
  "stock_locations",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    address: jsonb("address").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [
    index("stock_locations_seller_id_idx").on(t.sellerId),
    uniqueIndex("stock_locations_one_default_per_seller_idx")
      .on(t.sellerId)
      .where(sql`${t.isDefault} = true`),
  ],
);

export type Seller = typeof sellers.$inferSelect;
export type NewSeller = typeof sellers.$inferInsert;
export type StockLocation = typeof stockLocations.$inferSelect;
export type NewStockLocation = typeof stockLocations.$inferInsert;
