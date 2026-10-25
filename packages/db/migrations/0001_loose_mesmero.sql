CREATE TYPE "public"."channel_account_status" AS ENUM('pending_onboarding', 'pending_auth', 'active', 'token_expired', 'suspended', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."integration_mode" AS ENUM('api', 'file');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('draft', 'validation_failed', 'ready', 'submitting', 'pending_review', 'live', 'rejected', 'paused', 'delisted', 'error');--> statement-breakpoint
CREATE TYPE "public"."marketplace" AS ENUM('amazon', 'flipkart', 'meesho', 'ajio');--> statement-breakpoint
CREATE TYPE "public"."movement_reason" AS ENUM('initial', 'receive', 'adjustment', 'sale', 'cancellation', 'return_restock', 'return_damaged', 'transfer_in', 'transfer_out');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('created', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'returned', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."return_status" AS ENUM('requested', 'approved', 'in_transit', 'received', 'closed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."seller_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."sync_run_status" AS ENUM('queued', 'running', 'succeeded', 'partially_failed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_run_type" AS ENUM('listing_publish', 'stock_push', 'price_push', 'order_ingest', 'return_ingest', 'token_refresh');--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"s3_key" text NOT NULL,
	"position" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"brand" text NOT NULL,
	"hsn_code" text NOT NULL,
	"gst_rate_bps" integer NOT NULL,
	"country_of_origin" text NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"gtin" text,
	"mrp_paise" integer NOT NULL,
	"selling_price_paise" integer NOT NULL,
	"weight_grams" integer NOT NULL,
	"length_mm" integer NOT NULL,
	"width_mm" integer NOT NULL,
	"height_mm" integer NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variants_seller_id_sku_unique" UNIQUE("seller_id","sku"),
	CONSTRAINT "variants_selling_price_lte_mrp" CHECK ("variants"."selling_price_paise" <= "variants"."mrp_paise")
);
--> statement-breakpoint
CREATE TABLE "channel_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"marketplace" "marketplace" NOT NULL,
	"external_seller_id" text,
	"status" "channel_account_status" NOT NULL,
	"integration_mode" "integration_mode" NOT NULL,
	"token_secret_ref" text,
	"token_expires_at" timestamp with time zone,
	"default_safety_buffer" integer DEFAULT 0 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_accounts_seller_marketplace_external_unique" UNIQUE("seller_id","marketplace","external_seller_id")
);
--> statement-breakpoint
CREATE TABLE "channel_listing_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"channel_listing_id" uuid NOT NULL,
	"from_status" "listing_status",
	"to_status" "listing_status" NOT NULL,
	"message" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_listings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"status" "listing_status" DEFAULT 'draft' NOT NULL,
	"external_product_id" text,
	"external_listing_id" text,
	"channel_category_id" text,
	"channel_attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_override_paise" integer,
	"safety_buffer_override" integer,
	"last_pushed_quantity" integer,
	"last_pushed_price_paise" integer,
	"last_error" jsonb,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_listings_variant_channel_account_unique" UNIQUE("variant_id","channel_account_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_levels" (
	"seller_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_levels_variant_id_location_id_pk" PRIMARY KEY("variant_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity_delta" integer NOT NULL,
	"reason" "movement_reason" NOT NULL,
	"source_type" text NOT NULL,
	"source_ref" text,
	"idempotency_key" text NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movements_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "inventory_movements_quantity_delta_nonzero" CHECK ("inventory_movements"."quantity_delta" <> 0)
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"external_line_id" text NOT NULL,
	"external_sku" text NOT NULL,
	"variant_id" uuid,
	"quantity" integer NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"status" "order_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_lines_order_external_line_unique" UNIQUE("order_id","external_line_id")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"marketplace" "marketplace" NOT NULL,
	"external_order_id" text NOT NULL,
	"status" "order_status" NOT NULL,
	"raw_status" text NOT NULL,
	"ordered_at" timestamp with time zone NOT NULL,
	"total_paise" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_channel_account_external_order_unique" UNIQUE("channel_account_id","external_order_id")
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_line_id" uuid,
	"external_return_id" text NOT NULL,
	"status" "return_status" NOT NULL,
	"quantity" integer NOT NULL,
	"reason" text,
	"restocked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "returns_channel_account_external_return_unique" UNIQUE("channel_account_id","external_return_id")
);
--> statement-breakpoint
CREATE TABLE "sellers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"legal_name" text NOT NULL,
	"gstin" text,
	"status" "seller_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"address" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"channel_account_id" uuid,
	"type" "sync_run_type" NOT NULL,
	"status" "sync_run_status" NOT NULL,
	"bullmq_job_id" text,
	"items_total" integer DEFAULT 0 NOT NULL,
	"items_succeeded" integer DEFAULT 0 NOT NULL,
	"items_failed" integer DEFAULT 0 NOT NULL,
	"error" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_accounts" ADD CONSTRAINT "channel_accounts_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_listing_events" ADD CONSTRAINT "channel_listing_events_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_listing_events" ADD CONSTRAINT "cle_channel_listing_id_fk" FOREIGN KEY ("channel_listing_id") REFERENCES "public"."channel_listings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_listings" ADD CONSTRAINT "channel_listings_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_listings" ADD CONSTRAINT "channel_listings_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_listings" ADD CONSTRAINT "channel_listings_channel_account_id_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_location_id_stock_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_location_id_stock_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_channel_account_id_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_channel_account_id_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_channel_account_id_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_images_seller_id_idx" ON "product_images" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "product_images_product_id_position_idx" ON "product_images" USING btree ("product_id","position");--> statement-breakpoint
CREATE INDEX "products_seller_id_idx" ON "products" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "variants_seller_id_idx" ON "variants" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "variants_product_id_idx" ON "variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "channel_accounts_seller_id_idx" ON "channel_accounts" USING btree ("seller_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_accounts_seller_marketplace_unconnected_idx" ON "channel_accounts" USING btree ("seller_id","marketplace") WHERE "channel_accounts"."external_seller_id" is null;--> statement-breakpoint
CREATE INDEX "channel_listing_events_seller_id_idx" ON "channel_listing_events" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "channel_listing_events_listing_created_at_idx" ON "channel_listing_events" USING btree ("channel_listing_id","created_at");--> statement-breakpoint
CREATE INDEX "channel_listings_seller_id_idx" ON "channel_listings" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "channel_listings_channel_account_status_idx" ON "channel_listings" USING btree ("channel_account_id","status");--> statement-breakpoint
CREATE INDEX "inventory_levels_seller_id_idx" ON "inventory_levels" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_seller_id_idx" ON "inventory_movements" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_variant_location_created_at_idx" ON "inventory_movements" USING btree ("variant_id","location_id","created_at");--> statement-breakpoint
CREATE INDEX "order_lines_seller_id_idx" ON "order_lines" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "order_lines_variant_id_idx" ON "order_lines" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "orders_seller_id_ordered_at_idx" ON "orders" USING btree ("seller_id","ordered_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "returns_seller_id_idx" ON "returns" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "stock_locations_seller_id_idx" ON "stock_locations" USING btree ("seller_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_locations_one_default_per_seller_idx" ON "stock_locations" USING btree ("seller_id") WHERE "stock_locations"."is_default" = true;--> statement-breakpoint
CREATE INDEX "sync_runs_seller_id_created_at_idx" ON "sync_runs" USING btree ("seller_id","created_at" DESC NULLS LAST);--> statement-breakpoint
COMMENT ON COLUMN "channel_accounts"."token_secret_ref" IS 'REFERENCE to a secret in the secrets layer — never the OAuth token itself.';--> statement-breakpoint
COMMENT ON TABLE "inventory_levels" IS 'Derived from inventory_movements; only written inside the ledger transaction.';--> statement-breakpoint
COMMENT ON COLUMN "orders"."payload" IS 'Must have buyer PII (name, address, phone, email) stripped before storage. Do not add buyer PII columns.';