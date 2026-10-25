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

export type GetTestDbOptions = {
  /**
   * Appended to the TEST_DATABASE_URL database name so each package gets an
   * isolated DB (e.g. "db" → onelister_test_db, "core" → onelister_test_core).
   * Required: Turborepo runs package tests in parallel.
   */
  packageSuffix: string;
  /** Pool size. Use ≥10 for concurrency tests. Default 5. */
  maxConnections?: number;
};

let sql: ReturnType<typeof postgres> | undefined;
let db: TestDb | undefined;
let migrated = false;
let configuredSuffix: string | undefined;

function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is required for @one-lister/db integration tests (see .env.example)",
    );
  }
  return url;
}

/** Resolve the per-package test database URL from TEST_DATABASE_URL + suffix. */
export function resolveTestDatabaseUrl(packageSuffix: string): string {
  if (!packageSuffix || packageSuffix.includes("/") || packageSuffix.includes("\\")) {
    throw new Error("packageSuffix must be a non-empty identifier (e.g. \"db\", \"core\")");
  }

  const testUrl = new URL(requireTestDatabaseUrl());
  const baseName = testUrl.pathname.replace(/^\//, "");
  if (!baseName) {
    throw new Error("TEST_DATABASE_URL must include a database name");
  }

  // Avoid double-appending if the URL already ends with _<suffix>.
  const dbName = baseName.endsWith(`_${packageSuffix}`)
    ? baseName
    : `${baseName}_${packageSuffix}`;

  testUrl.pathname = `/${dbName}`;
  return testUrl.toString();
}

/** Ensure the test database exists (create via the maintenance DB if needed). */
export async function ensureTestDatabase(packageSuffix: string): Promise<void> {
  const testUrl = new URL(resolveTestDatabaseUrl(packageSuffix));
  const dbName = testUrl.pathname.replace(/^\//, "");

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

/**
 * Shared test DB client for a package. Call once per process with a stable
 * packageSuffix; subsequent calls reuse the pool (maxConnections is ignored).
 */
export async function getTestDb(
  options: GetTestDbOptions,
): Promise<{ db: TestDb; sql: ReturnType<typeof postgres> }> {
  const { packageSuffix, maxConnections = 5 } = options;

  if (configuredSuffix !== undefined && configuredSuffix !== packageSuffix) {
    throw new Error(
      `getTestDb already configured for suffix "${configuredSuffix}"; cannot switch to "${packageSuffix}"`,
    );
  }

  if (!sql || !db) {
    await ensureTestDatabase(packageSuffix);
    const url = resolveTestDatabaseUrl(packageSuffix);
    sql = postgres(url, { max: maxConnections });
    db = drizzle(sql, { schema });
    configuredSuffix = packageSuffix;
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
  if (!sql) {
    throw new Error("resetTestDb called before getTestDb");
  }
  await sql.unsafe(
    `TRUNCATE ${TENANT_TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

export async function closeTestDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = undefined;
    db = undefined;
    migrated = false;
    configuredSuffix = undefined;
  }
}
