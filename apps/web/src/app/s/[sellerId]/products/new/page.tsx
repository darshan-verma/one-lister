import Link from "next/link";

import { requireSellerContext } from "@/server/auth";

import { NewProductForm } from "./product-form";

type Props = { params: Promise<{ sellerId: string }> };

export default async function NewProductPage({ params }: Props) {
  const { sellerId } = await params;
  await requireSellerContext(sellerId);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">
          Catalog
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">New product</h1>
      </div>
      <NewProductForm sellerId={sellerId} />
      <Link
        className="text-sm text-black/60 underline"
        href={`/s/${sellerId}/products`}
      >
        ← Back to products
      </Link>
    </main>
  );
}
