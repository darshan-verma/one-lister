import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

import * as schema from "../schema/index.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations",
);

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

let sql: ReturnType<typeof postgres> | undefined;
let db: TestDb | undefined;
let migrated = false;

function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is required for @one-lister/db integration tests (see .env.example)",
    );
  }
  return url;
}

/** Ensure the test database exists (create via the maintenance DB if needed). */
export async function ensureTestDatabase(): Promise<void> {
  const testUrl = new URL(requireTestDatabaseUrl());
  const dbName = testUrl.pathname.replace(/^\//, "");
  if (!dbName) {
    throw new Error("TEST_DATABASE_URL must include a database name");
  }

  const adminUrl = new URL(testUrl.toString());
  adminUrl.pathname = "/postgres";

  const admin = postgres(adminUrl.toString(), { max: 1 });
  try {
    const rows = await admin<{ exists: boolean }[]>`
      select exists(
        select 1 from pg_database where datname = ${dbName}
      ) as exists
    `;
    if (!rows[0]?.exists) {
      // CREATE DATABASE cannot run inside a prepared transaction / parameterized query.
      await admin.unsafe(`CREATE DATABASE "${dbName.replaceAll('"', "")}"`);
    }
  } finally {
    await admin.end({ timeout: 5 });
  }
}

export async function getTestDb(): Promise<{ db: TestDb; sql: ReturnType<typeof postgres> }> {
  if (!sql || !db) {
    await ensureTestDatabase();
    const url = requireTestDatabaseUrl();
    sql = postgres(url, { max: 5 });
    db = drizzle(sql, { schema });
  }

  if (!migrated) {
    await migrate(db, { migrationsFolder });
    migrated = true;
  }

  return { db, sql };
}

const TENANT_TABLES = [
  "sync_runs",
  "channel_listing_events",
  "channel_listings",
  "returns",
  "order_lines",
  "orders",
  "inventory_movements",
  "inventory_levels",
  "product_images",
  "variants",
  "products",
  "channel_accounts",
  "stock_locations",
  "sellers",
] as const;

/** Wipe tenant data between tests (keeps drizzle migrations table). */
export async function resetTestDb(): Promise<void> {
  const { sql: client } = await getTestDb();
  await client.unsafe(
    `TRUNCATE ${TENANT_TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

export async function closeTestDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = undefined;
    db = undefined;
    migrated = false;
  }
}
