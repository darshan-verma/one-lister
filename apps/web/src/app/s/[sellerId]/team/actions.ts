"use server";

import {
  createInvitation,
  revokeInvitation,
  type EmailSender,
} from "@one-lister/core";
import { loadEnv } from "@one-lister/config/env";
import { revalidatePath } from "next/cache";

import { getAppDb } from "@/lib/db";
import { getEmailSender } from "@/lib/email";
import { mapActionError } from "@/server/action-errors";
import { requireRole, requireSellerContext } from "@/server/auth";

export type InviteState = {
  error?: string;
  inviteUrl?: string;
};

export async function inviteMemberAction(
  sellerId: string,
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const ctx = await requireSellerContext(sellerId);
  requireRole(ctx, "owner");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "staff");
  if (role !== "owner" && role !== "staff") {
    return { error: "Invalid role" };
  }

  try {
    // Always write against the authorized seller id from context (equals arg after auth).
    const { rawToken, invitation } = await createInvitation(getAppDb(), {
      sellerId: ctx.sellerId,
      email,
      role,
      invitedByUserId: ctx.userId,
    });

    const env = loadEnv();
    const inviteUrl = `${env.APP_URL}/invite/${rawToken}`;
    const mailer: EmailSender = getEmailSender();
    await mailer.send({
      to: email,
      subject: "You're invited to One Lister",
      text: `You've been invited as ${invitation.role}.\nAccept: ${inviteUrl}\nExpires in 7 days.`,
    });

    revalidatePath(`/s/${ctx.sellerId}/team`);
    return { inviteUrl };
  } catch (err) {
    return { error: mapActionError(err, "inviteMemberAction") };
  }
}

export async function revokeInvitationAction(
  sellerId: string,
  invitationId: string,
): Promise<void> {
  const ctx = await requireSellerContext(sellerId);
  requireRole(ctx, "owner");
  await revokeInvitation(getAppDb(), {
    sellerId: ctx.sellerId,
    invitationId,
    actorUserId: ctx.userId,
  });
  revalidatePath(`/s/${ctx.sellerId}/team`);
}
