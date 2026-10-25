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
  uuid,
} from "drizzle-orm/pg-core";

import { channelAccounts } from "./channels.js";
import { syncRunStatusEnum, syncRunTypeEnum } from "./enums.js";
import { sellers } from "./sellers.js";

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    channelAccountId: uuid("channel_account_id"),
    type: syncRunTypeEnum("type").notNull(),
    status: syncRunStatusEnum("status").notNull(),
    bullmqJobId: text("bullmq_job_id"),
    itemsTotal: integer("items_total").notNull().default(0),
    itemsSucceeded: integer("items_succeeded").notNull().default(0),
    itemsFailed: integer("items_failed").notNull().default(0),
    error: jsonb("error").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "sync_account_seller_fk",
      columns: [t.channelAccountId, t.sellerId],
      foreignColumns: [channelAccounts.id, channelAccounts.sellerId],
    }).onDelete("restrict"),
    index("sync_runs_seller_id_created_at_idx").on(t.sellerId, t.createdAt.desc()),
    index("sync_runs_channel_account_id_idx").on(t.channelAccountId),
    check("sync_runs_items_total_nonneg", sql`${t.itemsTotal} >= 0`),
    check("sync_runs_items_succeeded_nonneg", sql`${t.itemsSucceeded} >= 0`),
    check("sync_runs_items_failed_nonneg", sql`${t.itemsFailed} >= 0`),
  ],
);

export type SyncRun = typeof syncRuns.$inferSelect;
export type NewSyncRun = typeof syncRuns.$inferInsert;
