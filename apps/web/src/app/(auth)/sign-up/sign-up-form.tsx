"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authClient } from "@/lib/auth-client";

export function SignUpForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "");
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");

    const { error: err } = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL: "/onboarding/create-seller",
    });

    setPending(false);
    if (err) {
      if (err.status === 429) {
        setError("Too many attempts. Please try again later.");
        return;
      }
      setError(err.message ?? "Sign up failed");
      return;
    }

    router.push("/verify-email");
    router.refresh();
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input
          className="rounded border border-black/20 px-3 py-2"
          name="name"
          type="text"
          required
          autoComplete="name"
        />
      </label>
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
        {pending ? "Creating…" : "Sign up"}
      </button>
    </form>
  );
}
