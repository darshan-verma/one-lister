import { pgEnum } from "drizzle-orm/pg-core";

export const marketplaceEnum = pgEnum("marketplace", [
  "amazon",
  "flipkart",
  "meesho",
  "ajio",
]);

export const sellerStatusEnum = pgEnum("seller_status", ["active", "suspended"]);

export const channelAccountStatusEnum = pgEnum("channel_account_status", [
  "pending_onboarding",
  "pending_auth",
  "active",
  "token_expired",
  "suspended",
  "disconnected",
]);

export const integrationModeEnum = pgEnum("integration_mode", ["api", "file"]);

export const productStatusEnum = pgEnum("product_status", ["draft", "active", "archived"]);

export const listingStatusEnum = pgEnum("listing_status", [
  "draft",
  "validation_failed",
  "ready",
  "submitting",
  "pending_review",
  "live",
  "rejected",
  "paused",
  "delisted",
  "error",
]);

export const movementReasonEnum = pgEnum("movement_reason", [
  "initial",
  "receive",
  "adjustment",
  "sale",
  "cancellation",
  "return_restock",
  "transfer_in",
  "transfer_out",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "created",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
  "unknown",
]);

export const returnStatusEnum = pgEnum("return_status", [
  "requested",
  "approved",
  "in_transit",
  "received",
  "closed",
  "rejected",
]);

export const syncRunTypeEnum = pgEnum("sync_run_type", [
  "listing_publish",
  "stock_push",
  "price_push",
  "order_ingest",
  "return_ingest",
  "token_refresh",
]);

export const syncRunStatusEnum = pgEnum("sync_run_status", [
  "queued",
  "running",
  "succeeded",
  "partially_failed",
  "failed",
]);

/** Null on the user row = normal seller user (not platform staff). */
export const platformRoleEnum = pgEnum("platform_role", ["ops_agent", "admin"]);

export const sellerMemberRoleEnum = pgEnum("seller_member_role", [
  "owner",
  "staff",
]);
