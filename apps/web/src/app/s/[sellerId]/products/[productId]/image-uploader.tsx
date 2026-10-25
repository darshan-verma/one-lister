"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  confirmImageUploadAction,
  deleteImageAction,
  reorderImagesAction,
  requestImageUploadAction,
} from "../actions";

type ImageRow = {
  id: string;
  s3Key: string;
  position: number;
  width: number | null;
  height: number | null;
  url: string;
};

type Props = {
  sellerId: string;
  productId: string;
  images: ImageRow[];
};

export function ImageUploader({ sellerId, productId, images }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [order, setOrder] = useState(() => images.map((i) => i.id));

  async function onFile(file: File) {
    setError(null);
    const contentType = file.type;
    if (
      contentType !== "image/jpeg" &&
      contentType !== "image/png" &&
      contentType !== "image/webp"
    ) {
      setError("Only JPEG, PNG, or WebP images are allowed.");
      return;
    }

    startTransition(async () => {
      const req = await requestImageUploadAction(sellerId, productId, {
        contentType,
        sizeBytes: file.size,
      });
      if ("error" in req) {
        setError(req.error);
        return;
      }
      const put = await fetch(req.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!put.ok) {
        setError("Upload to storage failed.");
        return;
      }
      const conf = await confirmImageUploadAction(sellerId, productId, req.key);
      if (conf.error) {
        setError(conf.error);
        return;
      }
      router.refresh();
    });
  }

  function move(id: string, dir: -1 | 1) {
    const idx = order.indexOf(id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= order.length) return;
    const next = [...order];
    const tmp = next[idx]!;
    next[idx] = next[swap]!;
    next[swap] = tmp;
    setOrder(next);
    startTransition(async () => {
      const res = await reorderImagesAction(sellerId, productId, next);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Images</h2>
      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : null}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={pending}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = "";
        }}
      />
      <ul className="flex flex-col gap-2">
        {images
          .slice()
          .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
          .map((img) => (
            <li
              key={img.id}
              className="flex items-center gap-3 rounded border border-black/10 bg-white p-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt=""
                className="h-16 w-16 object-cover"
              />
              <div className="flex-1 text-xs text-black/60">
                {img.width && img.height
                  ? `${img.width}×${img.height}`
                  : "Processing…"}
              </div>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => move(img.id, -1)}
              >
                Up
              </button>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => move(img.id, 1)}
              >
                Down
              </button>
              <button
                type="button"
                className="text-xs text-red-700 underline"
                onClick={() => {
                  startTransition(async () => {
                    const res = await deleteImageAction(
                      sellerId,
                      productId,
                      img.id,
                    );
                    if (res.error) setError(res.error);
                    else router.refresh();
                  });
                }}
              >
                Delete
              </button>
            </li>
          ))}
      </ul>
    </section>
  );
}
