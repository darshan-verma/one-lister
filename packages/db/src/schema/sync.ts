import {
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
    channelAccountId: uuid("channel_account_id").references(
      () => channelAccounts.id,
      { onDelete: "restrict" },
    ),
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
    index("sync_runs_seller_id_created_at_idx").on(t.sellerId, t.createdAt.desc()),
  ],
);

export type SyncRun = typeof syncRuns.$inferSelect;
export type NewSyncRun = typeof syncRuns.$inferInsert;
