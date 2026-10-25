"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { revokeInvitationAction } from "./actions";

export function RevokeInvitationButton({
  sellerId,
  invitationId,
}: {
  sellerId: string;
  invitationId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      className="text-sm underline disabled:opacity-60"
      disabled={pending}
      type="button"
      onClick={() => {
        setPending(true);
        void revokeInvitationAction(sellerId, invitationId).then(() => {
          setPending(false);
          router.refresh();
        });
      }}
    >
      {pending ? "…" : "Revoke"}
    </button>
  );
}
