import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.js";

export type DbClient = ReturnType<typeof createDb>;
export type Db = DbClient["db"];

const globalForDb = globalThis as typeof globalThis & {
  __oneListerDb?: DbClient;
};

let singleton: DbClient | undefined;

/**
 * Create a Drizzle client bound to the given Postgres connection string.
 * Prefer {@link getDb} for app code so the pool is shared per process.
 */
export function createDb(connectionString: string) {
  const sql = postgres(connectionString, { max: 10 });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

/**
 * Lazily create a per-process shared DB client.
 * In development the instance is stored on `globalThis` so Next.js HMR
 * does not leak connection pools.
 */
export function getDb(connectionString: string): DbClient {
  if (process.env.NODE_ENV !== "production") {
    if (!globalForDb.__oneListerDb) {
      globalForDb.__oneListerDb = createDb(connectionString);
    }
    return globalForDb.__oneListerDb;
  }

  if (!singleton) {
    singleton = createDb(connectionString);
  }
  return singleton;
}

/** Lightweight connectivity check — uses the shared client, never opens a one-shot pool. */
export async function checkDatabase(connectionString: string): Promise<boolean> {
  const { sql } = getDb(connectionString);
  try {
    await sql`select 1`;
    return true;
  } catch {
    return false;
  }
}
