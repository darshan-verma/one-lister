import { loadEnv } from "@one-lister/config/env";
import { getDb, type Db } from "@one-lister/db";

export function getAppDb(): Db {
  const env = loadEnv();
  return getDb(env.DATABASE_URL).db;
}
