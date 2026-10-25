import { v7 as uuidv7 } from "uuid";

/** Generate a UUIDv7 primary key in the app (DB has no uuid default). */
export function newId(): string {
  return uuidv7();
}
