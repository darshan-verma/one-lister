"use server";

import { acceptInvitation } from "@one-lister/core";
import { redirect } from "next/navigation";

import { getAppDb } from "@/lib/db";
import { mapActionError } from "@/server/action-errors";
import { requireUser } from "@/server/auth";

export type AcceptInvitationResult =
  | { ok: true; sellerId: string }
  | { ok: false; error: string };

/**
 * Accept an invite. Auth + email come from the session — never from the client body.
 * Core acceptInvitation also rejects email mismatch / expiry / reuse.
 */
export async function acceptInvitationAction(
  rawToken: string,
): Promise<AcceptInvitationResult> {
  const user = await requireUser();
  if (!user.emailVerified) {
    redirect("/verify-email");
  }

  try {
    const result = await acceptInvitation(getAppDb(), {
      rawToken,
      userId: user.id,
      userEmail: user.email,
    });
    return { ok: true, sellerId: result.member.sellerId };
  } catch (err) {
    return { ok: false, error: mapActionError(err, "acceptInvitationAction") };
  }
}
