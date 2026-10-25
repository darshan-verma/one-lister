"use client";

import { useActionState } from "react";

import { createSellerAction, type CreateSellerState } from "./actions";

const initial: CreateSellerState = {};

export function CreateSellerForm() {
  const [state, action, pending] = useActionState(createSellerAction, initial);

  return (
    <form className="flex flex-col gap-3" action={action}>
      <label className="flex flex-col gap-1 text-sm">
        Display name
        <input
          className="rounded border border-black/20 px-3 py-2"
          name="displayName"
          required
          maxLength={200}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Legal name
        <input
          className="rounded border border-black/20 px-3 py-2"
          name="legalName"
          required
          maxLength={300}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        GSTIN (optional)
        <input
          className="rounded border border-black/20 px-3 py-2 uppercase"
          name="gstin"
          maxLength={15}
          placeholder="22AAAAA0000A1Z5"
        />
      </label>
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      <button
        className="rounded bg-[var(--accent)] px-4 py-2 text-white disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Creating…" : "Create seller"}
      </button>
    </form>
  );
}
