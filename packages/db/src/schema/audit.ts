import {
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth.js";
import { platformRoleEnum } from "./enums.js";
import { sellers } from "./sellers.js";

/** Append-only audit log. Never UPDATE or DELETE rows in application code. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey(),
    /** Null for platform-level events (e.g. role promotion). */
    sellerId: uuid("seller_id"),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    actorPlatformRole: platformRoleEnum("actor_platform_role"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_events_seller_created_idx").on(t.sellerId, t.createdAt.desc()),
    index("audit_events_actor_user_id_idx").on(t.actorUserId),
    foreignKey({
      columns: [t.sellerId],
      foreignColumns: [sellers.id],
      name: "audit_events_seller_id_fk",
    }).onDelete("restrict"),
  ],
);

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
