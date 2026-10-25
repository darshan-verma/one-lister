"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authClient } from "@/lib/auth-client";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");

    const { error: err } = await authClient.signIn.email({
      email,
      password,
    });

    setPending(false);
    if (err) {
      if (err.status === 403) {
        router.push("/verify-email");
        return;
      }
      if (err.status === 429) {
        setError("Too many attempts. Please try again later.");
        return;
      }
      setError(err.message ?? "Sign in failed");
      return;
    }

    const next = searchParams.get("next") || "/";
    router.push(next);
    router.refresh();
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
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          className="rounded border border-black/20 px-3 py-2"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          minLength={8}
        />
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        className="rounded bg-[var(--accent)] px-4 py-2 text-white disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <Link className="text-sm underline" href="/forgot-password">
        Forgot password?
      </Link>
    </form>
  );
}
