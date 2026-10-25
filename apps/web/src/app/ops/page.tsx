import { sellers } from "@one-lister/db";
import { asc } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getAppDb } from "@/lib/db";
import { requireUser } from "@/server/auth";

export default async function OpsPage() {
  const user = await requireUser();
  if (!user.emailVerified) {
    redirect("/verify-email");
  }
  if (user.platformRole !== "ops_agent" && user.platformRole !== "admin") {
    notFound();
  }

  const db = getAppDb();
  const rows = await db.select().from(sellers).orderBy(asc(sellers.displayName));

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <p className="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">
        One Lister · Ops
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Sellers</h1>
      <ul className="flex flex-col gap-2">
        {rows.map((s) => (
          <li key={s.id}>
            <Link
              className="block rounded border border-black/15 px-4 py-3 hover:bg-black/5"
              href={`/s/${s.id}`}
            >
              <span className="font-medium">{s.displayName}</span>
              <span className="ml-2 text-sm text-black/50">{s.status}</span>
            </Link>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="text-sm text-black/60">No sellers yet.</li>
        ) : null}
      </ul>
    </main>
  );
}
