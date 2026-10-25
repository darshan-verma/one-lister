import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/server/auth";

import { acceptInvitationAction } from "./actions";

type Props = { params: Promise<{ token: string }> };

export default async function InviteAcceptPage({ params }: Props) {
  const { token } = await params;
  const session = await getSession();

  if (!session?.user) {
    redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const result = await acceptInvitationAction(token);
  if (result.ok) {
    redirect(`/s/${result.sellerId}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Invite failed</h1>
      <p className="text-sm text-red-700">{result.error}</p>
      <p className="text-sm text-black/60">
        Signed in as {session.user.email}. Invitations must be accepted with the
        invited email address.
      </p>
      <Link className="text-sm underline" href="/">
        Home
      </Link>
    </main>
  );
}
