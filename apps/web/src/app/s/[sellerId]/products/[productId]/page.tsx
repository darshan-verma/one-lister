import {
  formatPaise,
  getProductCompleteness,
  getProductDetail,
} from "@one-lister/core";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAppDb } from "@/lib/db";
import { publicObjectUrl } from "@/lib/storage";
import { requireSellerContext } from "@/server/auth";

import {
  activateProductAction,
  archiveProductAction,
  updateProductAction,
  updateVariantAction,
} from "../actions";
import { ImageUploader } from "./image-uploader";

type Props = { params: Promise<{ sellerId: string; productId: string }> };

export default async function ProductDetailPage({ params }: Props) {
  const { sellerId, productId } = await params;
  const ctx = await requireSellerContext(sellerId);
  const detail = await getProductDetail(getAppDb(), ctx, productId);
  if (!detail) notFound();

  const completeness = await getProductCompleteness(getAppDb(), ctx, productId);
  const { product, variants, images } = detail;

  async function saveProduct(formData: FormData) {
    "use server";
    await updateProductAction(sellerId, formData);
  }

  async function activate(): Promise<void> {
    "use server";
    await activateProductAction(sellerId, productId);
  }

  async function archive(): Promise<void> {
    "use server";
    await archiveProductAction(sellerId, productId);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">
            Catalog
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {product.title}
          </h1>
          <p className="text-sm text-black/60 capitalize">
            Status: {product.status}
          </p>
        </div>
        <div className="flex gap-2">
          <form action={activate}>
            <button
              type="submit"
              disabled={!completeness.complete || product.status === "active"}
              title={
                completeness.complete
                  ? undefined
                  : completeness.missing.map((m) => m.message).join("; ")
              }
              className="rounded bg-[var(--accent)] px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Activate
            </button>
          </form>
          <form action={archive}>
            <button
              type="submit"
              className="rounded border border-black/20 px-3 py-2 text-sm"
            >
              Archive
            </button>
          </form>
        </div>
      </header>

      <section className="rounded border border-amber-200 bg-amber-50 p-4">
        <h2 className="mb-2 font-medium">Completeness</h2>
        {completeness.complete ? (
          <p className="text-sm text-green-800">Ready to activate.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-950">
            {completeness.missing.map((m, i) => (
              <li key={`${m.field}-${m.variantSku ?? ""}-${i}`}>{m.message}</li>
            ))}
          </ul>
        )}
      </section>

      <form action={saveProduct} className="flex flex-col gap-3 rounded border border-black/10 bg-white p-4">
        <h2 className="text-lg font-medium">Product details</h2>
        <input type="hidden" name="productId" value={product.id} />
        <input
          type="hidden"
          name="updatedAt"
          value={product.updatedAt.toISOString()}
        />
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input
            name="title"
            defaultValue={product.title}
            className="rounded border border-black/15 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Description
          <textarea
            name="description"
            defaultValue={product.description ?? ""}
            rows={4}
            className="rounded border border-black/15 px-3 py-2"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Brand
            <input
              name="brand"
              defaultValue={product.brand ?? ""}
              className="rounded border border-black/15 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            HSN code
            <input
              name="hsnCode"
              defaultValue={product.hsnCode ?? ""}
              className="rounded border border-black/15 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            GST rate (bps, 1800 = 18%)
            <input
              name="gstRateBps"
              type="number"
              defaultValue={product.gstRateBps ?? ""}
              className="rounded border border-black/15 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Country of origin
            <input
              name="countryOfOrigin"
              defaultValue={product.countryOfOrigin ?? ""}
              className="rounded border border-black/15 px-3 py-2"
            />
          </label>
        </div>
        <button
          type="submit"
          className="self-start rounded bg-black px-3 py-2 text-sm text-white"
        >
          Save product
        </button>
      </form>

      <ImageUploader
        key={images.map((i) => i.id).join(",")}
        sellerId={sellerId}
        productId={productId}
        images={images.map((img) => ({
          id: img.id,
          s3Key: img.s3Key,
          position: img.position,
          width: img.width,
          height: img.height,
          url: publicObjectUrl(img.s3Key),
        }))}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Variants</h2>
        <div className="overflow-x-auto rounded border border-black/10 bg-white">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-black/10 text-xs uppercase text-black/60">
              <tr>
                <th className="px-2 py-2">SKU</th>
                <th className="px-2 py-2">Price</th>
                <th className="px-2 py-2">MRP</th>
                <th className="px-2 py-2">W/L/W/H</th>
                <th className="px-2 py-2">Stock</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id} className="border-b border-black/5 align-top">
                  <td colSpan={6} className="px-2 py-3">
                    <form
                      action={async (fd) => {
                        "use server";
                        await updateVariantAction(sellerId, fd);
                      }}
                      className="grid grid-cols-[1fr_6rem_6rem_minmax(12rem,1fr)_auto_auto] items-end gap-2"
                    >
                      <input type="hidden" name="variantId" value={v.id} />
                      <input type="hidden" name="productId" value={productId} />
                      <input
                        type="hidden"
                        name="updatedAt"
                        value={v.updatedAt.toISOString()}
                      />
                      <label className="text-xs">
                        SKU
                        <input
                          name="sku"
                          defaultValue={v.sku}
                          className="mt-1 w-full rounded border border-black/15 px-2 py-1"
                        />
                      </label>
                      <label className="text-xs">
                        ₹ sell
                        <input
                          name="sellingPriceRupees"
                          defaultValue={(v.sellingPricePaise / 100).toFixed(2)}
                          className="mt-1 w-full rounded border border-black/15 px-2 py-1"
                        />
                      </label>
                      <label className="text-xs">
                        ₹ MRP
                        <input
                          name="mrpRupees"
                          defaultValue={(v.mrpPaise / 100).toFixed(2)}
                          className="mt-1 w-full rounded border border-black/15 px-2 py-1"
                        />
                      </label>
                      <div className="grid grid-cols-4 gap-1 text-xs">
                        <label>
                          g
                          <input
                            name="weightGrams"
                            type="number"
                            defaultValue={v.weightGrams ?? ""}
                            className="mt-1 w-full rounded border border-black/15 px-1 py-1"
                          />
                        </label>
                        <label>
                          L
                          <input
                            name="lengthMm"
                            type="number"
                            defaultValue={v.lengthMm ?? ""}
                            className="mt-1 w-full rounded border border-black/15 px-1 py-1"
                          />
                        </label>
                        <label>
                          W
                          <input
                            name="widthMm"
                            type="number"
                            defaultValue={v.widthMm ?? ""}
                            className="mt-1 w-full rounded border border-black/15 px-1 py-1"
                          />
                        </label>
                        <label>
                          H
                          <input
                            name="heightMm"
                            type="number"
                            defaultValue={v.heightMm ?? ""}
                            className="mt-1 w-full rounded border border-black/15 px-1 py-1"
                          />
                        </label>
                      </div>
                      <Link
                        href={`/s/${sellerId}/products/${productId}/variants/${v.id}/stock`}
                        className="text-xs underline"
                      >
                        Stock
                      </Link>
                      <button
                        type="submit"
                        className="rounded bg-black px-2 py-1 text-xs text-white"
                      >
                        Save
                      </button>
                      <p className="col-span-full text-xs text-black/50">
                        {Object.entries(
                          (v.attributes ?? {}) as Record<string, string>,
                        )
                          .map(([k, val]) => `${k}: ${val}`)
                          .join(" · ") || "Default variant"}{" "}
                        · listed {formatPaise(v.sellingPricePaise)}
                      </p>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Link
        className="text-sm text-black/60 underline"
        href={`/s/${sellerId}/products`}
      >
        ← Back to products
      </Link>
    </main>
  );
}
