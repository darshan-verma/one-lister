import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

export type Db = ReturnType<typeof createDb>;

/**
 * Create a Drizzle client bound to the given Postgres connection string.
 * Caller owns lifecycle of the underlying connection (see `sql.end()`).
 */
export function createDb(connectionString: string) {
  const sql = postgres(connectionString, { max: 10 });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

/** Lightweight connectivity check used by /api/health. */
export async function checkDatabase(connectionString: string): Promise<boolean> {
  const { sql } = createDb(connectionString);
  try {
    await sql`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
