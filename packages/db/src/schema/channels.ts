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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { variants } from "./catalog.js";
import {
  channelAccountStatusEnum,
  integrationModeEnum,
  listingStatusEnum,
  marketplaceEnum,
} from "./enums.js";
import { timestamps } from "./helpers.js";
import { sellers } from "./sellers.js";

export const channelAccounts = pgTable(
  "channel_accounts",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    marketplace: marketplaceEnum("marketplace").notNull(),
    /** Null until the seller connects / we know their marketplace seller id. */
    externalSellerId: text("external_seller_id"),
    status: channelAccountStatusEnum("status").notNull(),
    integrationMode: integrationModeEnum("integration_mode").notNull(),
    /**
     * REFERENCE to a secret in the secrets layer — never the OAuth token itself.
     * Never log or return this value to clients.
     */
    tokenSecretRef: text("token_secret_ref"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    defaultSafetyBuffer: integer("default_safety_buffer").notNull().default(0),
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("channel_accounts_id_seller_uidx").on(t.id, t.sellerId),
    index("channel_accounts_seller_id_idx").on(t.sellerId),
    unique("channel_accounts_seller_marketplace_external_unique").on(
      t.sellerId,
      t.marketplace,
      t.externalSellerId,
    ),
    // One unconnected account per seller+marketplace (external_seller_id still null).
    uniqueIndex("channel_accounts_seller_marketplace_unconnected_idx")
      .on(t.sellerId, t.marketplace)
      .where(sql`${t.externalSellerId} is null`),
    check(
      "channel_accounts_default_safety_buffer_nonneg",
      sql`${t.defaultSafetyBuffer} >= 0`,
    ),
  ],
);

export const channelListings = pgTable(
  "channel_listings",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").notNull(),
    channelAccountId: uuid("channel_account_id").notNull(),
    status: listingStatusEnum("status").notNull().default("draft"),
    /** Marketplace product id (ASIN, FSN, etc.). */
    externalProductId: text("external_product_id"),
    externalListingId: text("external_listing_id"),
    /** Marketplace seller SKU for this listing; used for order-line mapping. */
    externalSku: text("external_sku"),
    channelCategoryId: text("channel_category_id"),
    channelAttributes: jsonb("channel_attributes")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    priceOverridePaise: integer("price_override_paise"),
    safetyBufferOverride: integer("safety_buffer_override"),
    lastPushedQuantity: integer("last_pushed_quantity"),
    lastPushedPricePaise: integer("last_pushed_price_paise"),
    lastError: jsonb("last_error").$type<Record<string, unknown>>(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("channel_listings_id_seller_uidx").on(t.id, t.sellerId),
    foreignKey({
      name: "cl_variant_seller_fk",
      columns: [t.variantId, t.sellerId],
      foreignColumns: [variants.id, variants.sellerId],
    }).onDelete("restrict"),
    foreignKey({
      name: "cl_account_seller_fk",
      columns: [t.channelAccountId, t.sellerId],
      foreignColumns: [channelAccounts.id, channelAccounts.sellerId],
    }).onDelete("restrict"),
    index("channel_listings_seller_id_idx").on(t.sellerId),
    unique("channel_listings_variant_channel_account_unique").on(
      t.variantId,
      t.channelAccountId,
    ),
    index("channel_listings_channel_account_status_idx").on(
      t.channelAccountId,
      t.status,
    ),
    uniqueIndex("channel_listings_account_external_sku_uidx")
      .on(t.channelAccountId, t.externalSku)
      .where(sql`${t.externalSku} is not null`),
    check(
      "channel_listings_price_override_positive",
      sql`${t.priceOverridePaise} is null or ${t.priceOverridePaise} > 0`,
    ),
    check(
      "channel_listings_safety_buffer_override_nonneg",
      sql`${t.safetyBufferOverride} is null or ${t.safetyBufferOverride} >= 0`,
    ),
  ],
);

export const channelListingEvents = pgTable(
  "channel_listing_events",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    channelListingId: uuid("channel_listing_id").notNull(),
    fromStatus: listingStatusEnum("from_status"),
    toStatus: listingStatusEnum("to_status").notNull(),
    message: text("message"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "cle_listing_seller_fk",
      columns: [t.channelListingId, t.sellerId],
      foreignColumns: [channelListings.id, channelListings.sellerId],
    }).onDelete("restrict"),
    index("channel_listing_events_seller_id_idx").on(t.sellerId),
    index("channel_listing_events_listing_created_at_idx").on(
      t.channelListingId,
      t.createdAt,
    ),
  ],
);

export type ChannelAccount = typeof channelAccounts.$inferSelect;
export type NewChannelAccount = typeof channelAccounts.$inferInsert;
export type ChannelListing = typeof channelListings.$inferSelect;
export type NewChannelListing = typeof channelListings.$inferInsert;
export type ChannelListingEvent = typeof channelListingEvents.$inferSelect;
export type NewChannelListingEvent = typeof channelListingEvents.$inferInsert;
