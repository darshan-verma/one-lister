import { sellers } from "@one-lister/db";
import { eq } from "drizzle-orm";
import Link from "next/link";

import { getAppDb } from "@/lib/db";
import { requireSellerContext } from "@/server/auth";

type Props = { params: Promise<{ sellerId: string }> };

export default async function SellerHomePage({ params }: Props) {
  const { sellerId } = await params;
  const ctx = await requireSellerContext(sellerId);
  const db = getAppDb();
  const seller = await db.query.sellers.findFirst({
    where: eq(sellers.id, sellerId),
  });

  const roleLabel = ctx.memberRole ?? (ctx.platformRole ? `ops (${ctx.platformRole})` : "—");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <p className="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">
        One Lister
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">
        {seller?.displayName ?? "Seller"}
      </h1>
      <p className="text-black/70">
        Your role: <strong>{roleLabel}</strong>
      </p>
      <nav className="flex gap-4 text-sm">
        <Link className="underline" href={`/s/${sellerId}/products`}>
          Products
        </Link>
        <Link className="underline" href={`/s/${sellerId}/team`}>
          Team
        </Link>
        <Link className="underline" href="/">
          Switch seller
        </Link>
      </nav>
    </main>
  );
}
