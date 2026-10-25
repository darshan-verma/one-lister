import {
  sellerInvitations,
  sellerMembers,
  user,
} from "@one-lister/db";
import {
  closeTestDb,
  getTestDb,
  resetTestDb,
  type TestDb,
} from "@one-lister/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSeller } from "./create-seller.js";
import {
  acceptInvitation,
  createInvitation,
  hashInviteToken,
  InvitationError,
} from "./invitations.js";

async function seedUser(db: TestDb, email: string, id?: string) {
  const userId = id ?? `user_${email.replace(/[^a-z0-9]/gi, "_")}`;
  await db.insert(user).values({
    id: userId,
    name: email,
    email,
    emailVerified: true,
  });
  return userId;
}

describe("invitations", () => {
  let db: TestDb;

  beforeAll(async () => {
    ({ db } = await getTestDb({ packageSuffix: "core" }));
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  async function setupSeller() {
    const ownerId = await seedUser(db, "owner@example.com");
    const created = await createSeller(db, {
      userId: ownerId,
      displayName: "Invite Co",
      legalName: "Invite Co Pvt Ltd",
    });
    return { ownerId, sellerId: created.sellerId };
  }

  it("accept with matching email works once; token stored hashed", async () => {
    const { ownerId, sellerId } = await setupSeller();
    const inviteeId = await seedUser(db, "staff@example.com");

    const { rawToken, invitation } = await createInvitation(db, {
      sellerId,
      email: "staff@example.com",
      role: "staff",
      invitedByUserId: ownerId,
    });

    const stored = await db.query.sellerInvitations.findFirst({
      where: eq(sellerInvitations.id, invitation.id),
    });
    expect(stored?.tokenHash).toBe(hashInviteToken(rawToken));
    expect(JSON.stringify(stored)).not.toContain(rawToken);

    const accepted = await acceptInvitation(db, {
      rawToken,
      userId: inviteeId,
      userEmail: "staff@example.com",
    });
    expect(accepted.member.role).toBe("staff");

    const members = await db.query.sellerMembers.findMany({
      where: eq(sellerMembers.sellerId, sellerId),
    });
    expect(members).toHaveLength(2);

    await expect(
      acceptInvitation(db, {
        rawToken,
        userId: inviteeId,
        userEmail: "staff@example.com",
      }),
    ).rejects.toBeInstanceOf(InvitationError);
  });

  it("wrong email rejected", async () => {
    const { ownerId, sellerId } = await setupSeller();
    const otherId = await seedUser(db, "other@example.com");
    const { rawToken } = await createInvitation(db, {
      sellerId,
      email: "staff@example.com",
      role: "staff",
      invitedByUserId: ownerId,
    });

    await expect(
      acceptInvitation(db, {
        rawToken,
        userId: otherId,
        userEmail: "other@example.com",
      }),
    ).rejects.toMatchObject({ code: "email_mismatch" });
  });

  it("expired invitation rejected", async () => {
    const { ownerId, sellerId } = await setupSeller();
    const inviteeId = await seedUser(db, "late@example.com");
    const { rawToken, invitation } = await createInvitation(db, {
      sellerId,
      email: "late@example.com",
      role: "staff",
      invitedByUserId: ownerId,
    });

    await db
      .update(sellerInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sellerInvitations.id, invitation.id));

    await expect(
      acceptInvitation(db, {
        rawToken,
        userId: inviteeId,
        userEmail: "late@example.com",
      }),
    ).rejects.toMatchObject({ code: "expired" });
  });

  it("reused token rejected", async () => {
    const { ownerId, sellerId } = await setupSeller();
    const inviteeId = await seedUser(db, "once@example.com");
    const { rawToken } = await createInvitation(db, {
      sellerId,
      email: "once@example.com",
      role: "staff",
      invitedByUserId: ownerId,
    });

    await acceptInvitation(db, {
      rawToken,
      userId: inviteeId,
      userEmail: "once@example.com",
    });

    const another = await seedUser(db, "once2@example.com", "user_once2");
    // Token already accepted — even a different user cannot reuse it.
    await expect(
      acceptInvitation(db, {
        rawToken,
        userId: another,
        userEmail: "once@example.com",
      }),
    ).rejects.toMatchObject({ code: "already_accepted" });
  });
});
