import { loadEnv } from "@one-lister/config/env";
import { createDb, type Db } from "@one-lister/db";

let db: Db | undefined;

export function getWorkerDb(): Db {
  if (!db) {
    const env = loadEnv();
    db = createDb(env.DATABASE_URL).db;
  }
  return db;
}
