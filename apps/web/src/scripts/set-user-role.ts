/**
 * Promote/demote a user to ops_agent or admin (or clear platform role).
 * Usage: pnpm --filter @one-lister/web user:set-role <email> <role>
 * role: ops_agent | admin | null
 */
import { loadEnv } from "@one-lister/config/env";
import { writeAuditEvent } from "@one-lister/core";
import { createDb, user } from "@one-lister/db";
import { eq } from "drizzle-orm";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const roleArg = process.argv[3]?.trim();

  if (!email || !roleArg) {
    console.error(
      "Usage: pnpm --filter @one-lister/web user:set-role <email> <ops_agent|admin|null>",
    );
    process.exit(1);
  }

  let platformRole: "ops_agent" | "admin" | null;
  if (roleArg === "null" || roleArg === "none") {
    platformRole = null;
  } else if (roleArg === "ops_agent" || roleArg === "admin") {
    platformRole = roleArg;
  } else {
    console.error("role must be ops_agent, admin, or null");
    process.exit(1);
  }

  const env = loadEnv();
  const { db, sql } = createDb(env.DATABASE_URL);

  try {
    const existing = await db.query.user.findFirst({
      where: eq(user.email, email),
    });
    if (!existing) {
      console.error(`No user with email ${email}`);
      process.exit(1);
    }

    await db
      .update(user)
      .set({ platformRole, updatedAt: new Date() })
      .where(eq(user.id, existing.id));

    await writeAuditEvent(db, {
      actorUserId: existing.id,
      actorPlatformRole: platformRole,
      action: "platform.role_set",
      targetType: "user",
      targetId: existing.id,
      metadata: { email, platformRole },
    });

    console.log(`Updated ${email} platform_role → ${platformRole ?? "null"}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
