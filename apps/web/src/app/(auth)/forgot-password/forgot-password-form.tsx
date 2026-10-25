"use client";

import { useState, type FormEvent } from "react";

import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");

    const { error: err } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });

    setPending(false);
    if (err) {
      if (err.status === 429) {
        setError("Too many attempts. Please try again later.");
        return;
      }
      setError(err.message ?? "Request failed");
      return;
    }

    setMessage(
      "If that email exists, a reset link was sent. In local development check the server console.",
    );
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          className="rounded border border-black/20 px-3 py-2"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-black/70">{message}</p> : null}
      <button
        className="rounded bg-[var(--accent)] px-4 py-2 text-white disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
