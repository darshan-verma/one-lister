import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { productStatusEnum } from "./enums.js";
import { timestamps } from "./helpers.js";
import { sellers } from "./sellers.js";

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    brand: text("brand").notNull(),
    hsnCode: text("hsn_code").notNull(),
    /** GST rate in basis points (1800 = 18%). */
    gstRateBps: integer("gst_rate_bps").notNull(),
    countryOfOrigin: text("country_of_origin").notNull(),
    attributes: jsonb("attributes")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: productStatusEnum("status").notNull().default("draft"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("products_seller_id_idx").on(t.sellerId)],
);

export const variants = pgTable(
  "variants",
  {
    id: uuid("id").primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    /** Denormalised for tenancy-scoped queries without joining products. */
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    sku: text("sku").notNull(),
    gtin: text("gtin"),
    mrpPaise: integer("mrp_paise").notNull(),
    sellingPricePaise: integer("selling_price_paise").notNull(),
    weightGrams: integer("weight_grams").notNull(),
    lengthMm: integer("length_mm").notNull(),
    widthMm: integer("width_mm").notNull(),
    heightMm: integer("height_mm").notNull(),
    attributes: jsonb("attributes")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: productStatusEnum("status").notNull().default("draft"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("variants_seller_id_sku_unique").on(t.sellerId, t.sku),
    index("variants_seller_id_idx").on(t.sellerId),
    index("variants_product_id_idx").on(t.productId),
    check(
      "variants_selling_price_lte_mrp",
      sql`${t.sellingPricePaise} <= ${t.mrpPaise}`,
    ),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => variants.id, {
      onDelete: "restrict",
    }),
    s3Key: text("s3_key").notNull(),
    position: integer("position").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    ...timestamps,
  },
  (t) => [
    index("product_images_seller_id_idx").on(t.sellerId),
    index("product_images_product_id_position_idx").on(t.productId, t.position),
  ],
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Variant = typeof variants.$inferSelect;
export type NewVariant = typeof variants.$inferInsert;
export type ProductImage = typeof productImages.$inferSelect;
export type NewProductImage = typeof productImages.$inferInsert;
