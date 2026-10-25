"use server";

import { createSeller } from "@one-lister/core";
import { redirect } from "next/navigation";

import { getAppDb } from "@/lib/db";
import { requireUser } from "@/server/auth";

export type CreateSellerState = {
  error?: string;
};

export async function createSellerAction(
  _prev: CreateSellerState,
  formData: FormData,
): Promise<CreateSellerState> {
  const user = await requireUser();
  if (!user.emailVerified) {
    redirect("/verify-email");
  }

  const displayName = String(formData.get("displayName") ?? "").trim();
  const legalName = String(formData.get("legalName") ?? "").trim();
  const gstinRaw = String(formData.get("gstin") ?? "").trim();

  try {
    const result = await createSeller(getAppDb(), {
      userId: user.id,
      displayName,
      legalName,
      gstin: gstinRaw || undefined,
    });
    redirect(`/s/${result.sellerId}`);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create seller";
    // Next.js redirect throws; rethrow those.
    if (
      typeof err === "object" &&
      err !== null &&
      "digest" in err &&
      String((err as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: message };
  }
}
