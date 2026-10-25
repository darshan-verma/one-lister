import { createHash, randomBytes } from "node:crypto";

import {
  newId,
  sellerInvitations,
  sellerMembers,
  type Db,
  type SellerInvitation,
  type SellerMember,
} from "@one-lister/db";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { writeAuditEvent } from "../audit/write-audit-event.js";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const inviteInputSchema = z.object({
  sellerId: z.string().uuid(),
  email: z.string().trim().email().toLowerCase(),
  role: z.enum(["owner", "staff"]),
  invitedByUserId: z.string().min(1),
});

export type CreateInvitationInput = z.infer<typeof inviteInputSchema>;

export type CreateInvitationResult = {
  invitation: SellerInvitation;
  /** Raw token — return once to build the invite link; never store. */
  rawToken: string;
};

export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createInvitation(
  db: Db,
  rawInput: CreateInvitationInput,
): Promise<CreateInvitationResult> {
  const input = inviteInputSchema.parse(rawInput);
  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const id = newId();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  const [invitation] = await db
    .insert(sellerInvitations)
    .values({
      id,
      sellerId: input.sellerId,
      email: input.email,
      role: input.role,
      tokenHash,
      invitedByUserId: input.invitedByUserId,
      expiresAt,
    })
    .returning();

  if (!invitation) {
    throw new Error("failed to create invitation");
  }

  await writeAuditEvent(db, {
    sellerId: input.sellerId,
    actorUserId: input.invitedByUserId,
    action: "seller.invitation_created",
    targetType: "seller_invitation",
    targetId: id,
    metadata: { email: input.email, role: input.role },
  });

  return { invitation, rawToken };
}

export class InvitationError extends Error {
  override readonly name = "InvitationError";

  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "expired"
      | "already_accepted"
      | "email_mismatch"
      | "already_member",
  ) {
    super(message);
  }
}

export type AcceptInvitationInput = {
  rawToken: string;
  userId: string;
  userEmail: string;
};

export type AcceptInvitationResult = {
  member: SellerMember;
  invitation: SellerInvitation;
};

export async function acceptInvitation(
  db: Db,
  input: AcceptInvitationInput,
): Promise<AcceptInvitationResult> {
  const tokenHash = hashInviteToken(input.rawToken);
  const normalizedEmail = input.userEmail.trim().toLowerCase();

  return db.transaction(async (tx) => {
    const invitation = await tx.query.sellerInvitations.findFirst({
      where: eq(sellerInvitations.tokenHash, tokenHash),
    });

    if (!invitation) {
      throw new InvitationError("invitation not found", "not_found");
    }
    if (invitation.acceptedAt) {
      throw new InvitationError("invitation already used", "already_accepted");
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new InvitationError("invitation expired", "expired");
    }
    if (invitation.email.toLowerCase() !== normalizedEmail) {
      throw new InvitationError(
        "signed-in email does not match invitation",
        "email_mismatch",
      );
    }

    const existing = await tx.query.sellerMembers.findFirst({
      where: and(
        eq(sellerMembers.sellerId, invitation.sellerId),
        eq(sellerMembers.userId, input.userId),
      ),
    });
    if (existing) {
      throw new InvitationError("already a member of this seller", "already_member");
    }

    const memberId = newId();
    const [member] = await tx
      .insert(sellerMembers)
      .values({
        id: memberId,
        sellerId: invitation.sellerId,
        userId: input.userId,
        role: invitation.role,
      })
      .returning();

    if (!member) {
      throw new Error("failed to create membership");
    }

    const [updated] = await tx
      .update(sellerInvitations)
      .set({ acceptedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(sellerInvitations.id, invitation.id),
          isNull(sellerInvitations.acceptedAt),
        ),
      )
      .returning();

    if (!updated) {
      throw new InvitationError("invitation already used", "already_accepted");
    }

    await writeAuditEvent(tx, {
      sellerId: invitation.sellerId,
      actorUserId: input.userId,
      action: "seller.invitation_accepted",
      targetType: "seller_invitation",
      targetId: invitation.id,
      metadata: { role: invitation.role },
    });

    return { member, invitation: updated };
  });
}

export async function revokeInvitation(
  db: Db,
  params: {
    sellerId: string;
    invitationId: string;
    actorUserId: string;
  },
): Promise<void> {
  const deleted = await db
    .delete(sellerInvitations)
    .where(
      and(
        eq(sellerInvitations.id, params.invitationId),
        eq(sellerInvitations.sellerId, params.sellerId),
        isNull(sellerInvitations.acceptedAt),
      ),
    )
    .returning({ id: sellerInvitations.id });

  if (deleted.length === 0) {
    throw new InvitationError("invitation not found", "not_found");
  }

  await writeAuditEvent(db, {
    sellerId: params.sellerId,
    actorUserId: params.actorUserId,
    action: "seller.invitation_revoked",
    targetType: "seller_invitation",
    targetId: params.invitationId,
  });
}

export async function listSellerMembers(db: Db, sellerId: string) {
  return db.query.sellerMembers.findMany({
    where: eq(sellerMembers.sellerId, sellerId),
  });
}

export async function listPendingInvitations(db: Db, sellerId: string) {
  return db.query.sellerInvitations.findMany({
    where: and(
      eq(sellerInvitations.sellerId, sellerId),
      isNull(sellerInvitations.acceptedAt),
    ),
  });
}
