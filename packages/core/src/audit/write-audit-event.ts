import { auditEvents, newId, type Db } from "@one-lister/db";

export type WriteAuditEventInput = {
  sellerId?: string | null;
  actorUserId: string;
  actorPlatformRole?: "ops_agent" | "admin" | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

/** Accepts the root Db or a transaction client (both expose `.insert`). */
type DbWriter = Pick<Db, "insert">;

export async function writeAuditEvent(
  db: DbWriter,
  input: WriteAuditEventInput,
): Promise<{ id: string }> {
  const id = newId();
  await db.insert(auditEvents).values({
    id,
    sellerId: input.sellerId ?? null,
    actorUserId: input.actorUserId,
    actorPlatformRole: input.actorPlatformRole ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata ?? {},
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
  return { id };
}
