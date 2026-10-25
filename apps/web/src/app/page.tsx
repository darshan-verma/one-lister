import { sellerMembers, sellers } from "@one-lister/db";
import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAppDb } from "@/lib/db";
import { requireUser } from "@/server/auth";

export default async function HomePage() {
  const user = await requireUser();
  if (!user.emailVerified) {
    redirect("/verify-email");
  }

  const db = getAppDb();
  const memberships = await db.query.sellerMembers.findMany({
    where: eq(sellerMembers.userId, user.id),
  });

  if (memberships.length === 0) {
    redirect("/onboarding/create-seller");
  }

  if (memberships.length === 1 && memberships[0]) {
    redirect(`/s/${memberships[0].sellerId}`);
  }

  const sellerIds = memberships.map((m) => m.sellerId);
  const sellerRows = await db.query.sellers.findMany({
    where: inArray(sellers.id, sellerIds),
  });
  const byId = new Map(sellerRows.map((s) => [s.id, s]));

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 py-12">
      <p className="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">
        One Lister
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a seller</h1>
      <ul className="flex flex-col gap-2">
        {memberships.map((m) => {
          const seller = byId.get(m.sellerId);
          return (
            <li key={m.id}>
              <Link
                className="block rounded border border-black/15 px-4 py-3 hover:bg-black/5"
                href={`/s/${m.sellerId}`}
              >
                <span className="font-medium">
                  {seller?.displayName ?? m.sellerId}
                </span>
                <span className="ml-2 text-sm text-black/50">{m.role}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {(user.platformRole === "ops_agent" || user.platformRole === "admin") && (
        <Link className="text-sm underline" href="/ops">
          Ops panel
        </Link>
      )}
    </main>
  );
}
