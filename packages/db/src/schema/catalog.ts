import { sql } from "drizzle-orm";
import {
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

import { productImageStatusEnum, productStatusEnum } from "./enums.js";
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
    description: text("description"),
    brand: text("brand"),
    hsnCode: text("hsn_code"),
    /** GST rate in basis points (1800 = 18%). Nullable on drafts. */
    gstRateBps: integer("gst_rate_bps"),
    countryOfOrigin: text("country_of_origin"),
    attributes: jsonb("attributes")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: productStatusEnum("status").notNull().default("draft"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("products_id_seller_uidx").on(t.id, t.sellerId),
    index("products_seller_id_idx").on(t.sellerId),
    check(
      "products_gst_rate_bps_range",
      sql`${t.gstRateBps} is null or (${t.gstRateBps} between 0 and 10000)`,
    ),
  ],
);

export const variants = pgTable(
  "variants",
  {
    id: uuid("id").primaryKey(),
    productId: uuid("product_id").notNull(),
    /** Denormalised for tenancy-scoped queries without joining products. */
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    sku: text("sku").notNull(),
    gtin: text("gtin"),
    mrpPaise: integer("mrp_paise").notNull(),
    sellingPricePaise: integer("selling_price_paise").notNull(),
    weightGrams: integer("weight_grams"),
    lengthMm: integer("length_mm"),
    widthMm: integer("width_mm"),
    heightMm: integer("height_mm"),
    attributes: jsonb("attributes")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: productStatusEnum("status").notNull().default("draft"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("variants_id_seller_uidx").on(t.id, t.sellerId),
    unique("variants_seller_id_sku_unique").on(t.sellerId, t.sku),
    foreignKey({
      name: "variants_product_seller_fk",
      columns: [t.productId, t.sellerId],
      foreignColumns: [products.id, products.sellerId],
    }).onDelete("restrict"),
    index("variants_seller_id_idx").on(t.sellerId),
    index("variants_product_id_idx").on(t.productId),
    check(
      "variants_selling_price_lte_mrp",
      sql`${t.sellingPricePaise} <= ${t.mrpPaise}`,
    ),
    check("variants_mrp_paise_positive", sql`${t.mrpPaise} > 0`),
    check("variants_selling_price_positive", sql`${t.sellingPricePaise} > 0`),
    check(
      "variants_weight_grams_positive",
      sql`${t.weightGrams} is null or ${t.weightGrams} > 0`,
    ),
    check(
      "variants_length_mm_positive",
      sql`${t.lengthMm} is null or ${t.lengthMm} > 0`,
    ),
    check(
      "variants_width_mm_positive",
      sql`${t.widthMm} is null or ${t.widthMm} > 0`,
    ),
    check(
      "variants_height_mm_positive",
      sql`${t.heightMm} is null or ${t.heightMm} > 0`,
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
    productId: uuid("product_id").notNull(),
    variantId: uuid("variant_id"),
    s3Key: text("s3_key").notNull(),
    position: integer("position").notNull(),
    width: integer("width"),
    height: integer("height"),
    status: productImageStatusEnum("status").notNull().default("pending"),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "pi_product_seller_fk",
      columns: [t.productId, t.sellerId],
      foreignColumns: [products.id, products.sellerId],
    }).onDelete("restrict"),
    foreignKey({
      name: "pi_variant_seller_fk",
      columns: [t.variantId, t.sellerId],
      foreignColumns: [variants.id, variants.sellerId],
    }).onDelete("restrict"),
    unique("product_images_seller_s3_key_uidx").on(t.sellerId, t.s3Key),
    index("product_images_seller_id_idx").on(t.sellerId),
    index("product_images_product_id_position_idx").on(t.productId, t.position),
    index("product_images_variant_id_idx").on(t.variantId),
    check("product_images_position_nonneg", sql`${t.position} >= 0`),
    check(
      "product_images_width_positive",
      sql`${t.width} is null or ${t.width} > 0`,
    ),
    check(
      "product_images_height_positive",
      sql`${t.height} is null or ${t.height} > 0`,
    ),
  ],
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Variant = typeof variants.$inferSelect;
export type NewVariant = typeof variants.$inferInsert;
export type ProductImage = typeof productImages.$inferSelect;
export type NewProductImage = typeof productImages.$inferInsert;
