"use client";

import { useActionState } from "react";

import { inviteMemberAction, type InviteState } from "./actions";

const initial: InviteState = {};

export function InviteForm({ sellerId }: { sellerId: string }) {
  const bound = inviteMemberAction.bind(null, sellerId);
  const [state, action, pending] = useActionState(bound, initial);

  return (
    <form className="flex flex-col gap-3" action={action}>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          className="rounded border border-black/20 px-3 py-2"
          name="email"
          type="email"
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Role
        <select className="rounded border border-black/20 px-3 py-2" name="role" defaultValue="staff">
          <option value="staff">staff</option>
          <option value="owner">owner</option>
        </select>
      </label>
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      {state.inviteUrl ? (
        <p className="break-all text-sm text-black/70">
          Invite link (also emailed): {state.inviteUrl}
        </p>
      ) : null}
      <button
        className="w-fit rounded bg-[var(--accent)] px-4 py-2 text-white disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Sending…" : "Send invite"}
      </button>
    </form>
  );
}
