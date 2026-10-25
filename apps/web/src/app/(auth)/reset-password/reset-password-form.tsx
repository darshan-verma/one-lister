"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token) {
    return (
      <p className="text-sm text-red-700">
        Missing or invalid reset token. Request a new link from forgot password.
      </p>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const newPassword = String(fd.get("password") ?? "");

    const { error: err } = await authClient.resetPassword({
      newPassword,
      token,
    });

    setPending(false);
    if (err) {
      setError(err.message ?? "Reset failed");
      return;
    }

    router.push("/sign-in");
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <label className="flex flex-col gap-1 text-sm">
        New password
        <input
          className="rounded border border-black/20 px-3 py-2"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
        />
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        className="rounded bg-[var(--accent)] px-4 py-2 text-white disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
