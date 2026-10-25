import {
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth.js";
import { sellerMemberRoleEnum } from "./enums.js";
import { timestamps } from "./helpers.js";
import { sellers } from "./sellers.js";

export const sellerMembers = pgTable(
  "seller_members",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: sellerMemberRoleEnum("role").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("seller_members_id_seller_uidx").on(t.id, t.sellerId),
    unique("seller_members_seller_user_uidx").on(t.sellerId, t.userId),
    index("seller_members_seller_id_idx").on(t.sellerId),
    index("seller_members_user_id_idx").on(t.userId),
    foreignKey({
      columns: [t.sellerId],
      foreignColumns: [sellers.id],
      name: "seller_members_seller_id_fk",
    }).onDelete("restrict"),
  ],
);

export const sellerInvitations = pgTable(
  "seller_invitations",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id").notNull(),
    email: text("email").notNull(),
    role: sellerMemberRoleEnum("role").notNull(),
    /** SHA-256 hex of the raw invite token — never store the raw token. */
    tokenHash: text("token_hash").notNull(),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("seller_invitations_id_seller_uidx").on(t.id, t.sellerId),
    unique("seller_invitations_token_hash_uidx").on(t.tokenHash),
    index("seller_invitations_seller_id_idx").on(t.sellerId),
    index("seller_invitations_email_idx").on(t.email),
    foreignKey({
      columns: [t.sellerId],
      foreignColumns: [sellers.id],
      name: "seller_invitations_seller_id_fk",
    }).onDelete("restrict"),
  ],
);

export type SellerMember = typeof sellerMembers.$inferSelect;
export type NewSellerMember = typeof sellerMembers.$inferInsert;
export type SellerInvitation = typeof sellerInvitations.$inferSelect;
export type NewSellerInvitation = typeof sellerInvitations.$inferInsert;
