import {
  listPendingInvitations,
  listSellerMembers,
} from "@one-lister/core";
import Link from "next/link";

import { getAppDb } from "@/lib/db";
import { requireRole, requireSellerContext } from "@/server/auth";

import { InviteForm } from "./invite-form";
import { RevokeInvitationButton } from "./revoke-button";

type Props = { params: Promise<{ sellerId: string }> };

export default async function TeamPage({ params }: Props) {
  const { sellerId } = await params;
  const ctx = await requireSellerContext(sellerId);
  requireRole(ctx, "owner");

  const db = getAppDb();
  const [members, invitations] = await Promise.all([
    listSellerMembers(db, sellerId),
    listPendingInvitations(db, sellerId),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">
          One Lister
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Team</h1>
        <Link className="text-sm underline" href={`/s/${sellerId}`}>
          Back to seller
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Members</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {members.map((m) => (
            <li key={m.id} className="flex justify-between border-b border-black/10 py-2">
              <span className="font-mono text-xs">{m.userId}</span>
              <span>{m.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Invite by email</h2>
        <InviteForm sellerId={sellerId} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Pending invitations</h2>
        {invitations.length === 0 ? (
          <p className="text-sm text-black/60">None</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-4 border-b border-black/10 py-2"
              >
                <span>
                  {inv.email} · {inv.role} · expires{" "}
                  {inv.expiresAt.toISOString().slice(0, 10)}
                </span>
                <RevokeInvitationButton
                  sellerId={sellerId}
                  invitationId={inv.id}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
