import { listProducts } from "@one-lister/core";
import Link from "next/link";

import { getAppDb } from "@/lib/db";
import { publicObjectUrl } from "@/lib/storage";
import { requireSellerContext } from "@/server/auth";

type Props = {
  params: Promise<{ sellerId: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    cursor?: string;
  }>;
};

export default async function ProductsPage({ params, searchParams }: Props) {
  const { sellerId } = await params;
  const sp = await searchParams;
  const ctx = await requireSellerContext(sellerId);

  const status =
    sp.status === "draft" || sp.status === "active" || sp.status === "archived"
      ? sp.status
      : undefined;

  const { items, nextCursor } = await listProducts(getAppDb(), ctx, {
    search: sp.q,
    status,
    cursor: sp.cursor,
    limit: 25,
  });

  const base = `/s/${sellerId}/products`;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">
            Catalog
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Products</h1>
        </div>
        <Link
          href={`${base}/new`}
          className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
        >
          New product
        </Link>
      </header>

      <form className="flex flex-wrap gap-3" method="get">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search title or SKU"
          className="min-w-[16rem] flex-1 rounded border border-black/15 bg-white px-3 py-2 text-sm"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded border border-black/15 bg-white px-3 py-2 text-sm"
        >
          <option value="">All (non-archived)</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
        <button
          type="submit"
          className="rounded border border-black/20 px-4 py-2 text-sm"
        >
          Filter
        </button>
      </form>

      <div className="overflow-x-auto rounded border border-black/10 bg-white">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-black/10 bg-black/[0.03] text-xs uppercase tracking-wide text-black/60">
            <tr>
              <th className="px-3 py-2 font-medium">Image</th>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">Variants</th>
              <th className="px-3 py-2 font-medium">Stock</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-black/50">
                  No products yet.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.product.id}
                  className="border-b border-black/5 last:border-0"
                >
                  <td className="px-3 py-2">
                    {item.thumbnailKey ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={publicObjectUrl(item.thumbnailKey)}
                        alt=""
                        className="h-12 w-12 object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center bg-black/5 text-xs text-black/40">
                        —
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      className="font-medium underline-offset-2 hover:underline"
                      href={`${base}/${item.product.id}`}
                    >
                      {item.product.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{item.variantCount}</td>
                  <td className="px-3 py-2">{item.totalStock}</td>
                  <td className="px-3 py-2 capitalize">
                    {item.product.deletedAt ? "archived" : item.product.status}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {nextCursor ? (
        <Link
          className="text-sm underline"
          href={`${base}?${new URLSearchParams({
            ...(sp.q ? { q: sp.q } : {}),
            ...(status ? { status } : {}),
            cursor: nextCursor,
          }).toString()}`}
        >
          Next page
        </Link>
      ) : null}

      <Link className="text-sm text-black/60 underline" href={`/s/${sellerId}`}>
        ← Seller home
      </Link>
    </main>
  );
}
