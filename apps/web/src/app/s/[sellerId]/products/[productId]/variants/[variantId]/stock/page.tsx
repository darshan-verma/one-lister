import { getMovementHistory, getVariantStock } from "@one-lister/core";
import { variants } from "@one-lister/db";
import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAppDb } from "@/lib/db";
import { requireSellerContext } from "@/server/auth";

import { adjustStockAction } from "../../../../actions";
import { AdjustStockForm } from "./adjust-form";

type Props = {
  params: Promise<{
    sellerId: string;
    productId: string;
    variantId: string;
  }>;
  searchParams: Promise<{ cursor?: string }>;
};

export default async function VariantStockPage({ params, searchParams }: Props) {
  const { sellerId, productId, variantId } = await params;
  const sp = await searchParams;
  const ctx = await requireSellerContext(sellerId);
  const db = getAppDb();

  const variant = await db.query.variants.findFirst({
    where: and(
      eq(variants.id, variantId),
      eq(variants.sellerId, ctx.sellerId),
      eq(variants.productId, productId),
      isNull(variants.deletedAt),
    ),
  });
  if (!variant) notFound();

  const stock = await getVariantStock(db, ctx, variantId);
  const history = await getMovementHistory(db, ctx, variantId, {
    cursor: sp.cursor,
    limit: 25,
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">
          Inventory
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{variant.sku}</h1>
        <p className="text-lg">
          On hand: <strong>{stock.onHand}</strong>
        </p>
      </div>

      <AdjustStockForm
        action={async (fd) => {
          "use server";
          return adjustStockAction(sellerId, productId, variantId, fd);
        }}
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Movement history</h2>
        <ul className="divide-y divide-black/10 rounded border border-black/10 bg-white">
          {history.movements.length === 0 ? (
            <li className="px-3 py-4 text-sm text-black/50">No movements yet.</li>
          ) : (
            history.movements.map((m) => (
              <li key={m.id} className="flex justify-between gap-3 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">
                    {m.reason}{" "}
                    <span className={m.quantityDelta > 0 ? "text-green-700" : "text-red-700"}>
                      {m.quantityDelta > 0 ? "+" : ""}
                      {m.quantityDelta}
                    </span>
                  </div>
                  <div className="text-xs text-black/50">
                    {m.createdAt.toISOString()}
                    {m.note ? ` · ${m.note}` : ""}
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
        {history.nextCursor ? (
          <Link
            className="text-sm underline"
            href={`?cursor=${encodeURIComponent(history.nextCursor)}`}
          >
            Older
          </Link>
        ) : null}
      </section>

      <Link
        className="text-sm text-black/60 underline"
        href={`/s/${sellerId}/products/${productId}`}
      >
        ← Back to product
      </Link>
    </main>
  );
}
