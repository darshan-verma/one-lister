import { timestamp } from "drizzle-orm/pg-core";

/** created_at / updated_at columns shared by most tables. updated_at is set by the app on write. */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};
