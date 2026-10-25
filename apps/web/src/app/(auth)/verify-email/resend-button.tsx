"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export function ResendVerificationButton() {
  const { data } = authClient.useSession();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function resend() {
    const email = data?.user?.email;
    if (!email) {
      setMessage("Sign in first, then request a new verification email.");
      return;
    }
    setPending(true);
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/onboarding/create-seller",
    });
    setPending(false);
    setMessage(error ? (error.message ?? "Failed to send") : "Verification email sent.");
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        className="rounded border border-black/20 px-4 py-2 text-sm disabled:opacity-60"
        disabled={pending}
        type="button"
        onClick={() => void resend()}
      >
        {pending ? "Sending…" : "Resend verification email"}
      </button>
      {message ? <p className="text-sm text-black/70">{message}</p> : null}
    </div>
  );
}
