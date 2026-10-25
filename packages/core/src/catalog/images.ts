import {
  newId,
  productImages,
  type Db,
  type ProductImage,
} from "@one-lister/db";
import { and, asc, eq, max } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { writeAuditEvent } from "../audit/write-audit-event.js";
import { ProductNotFoundError } from "../errors.js";
import { requireProduct } from "./products.js";
import {
  requestImageUploadInputSchema,
  type RequestImageUploadInput,
} from "./schemas.js";
import type { CatalogTenantContext, JobEnqueuer } from "./types.js";
import type { ObjectStorage } from "../storage/types.js";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const ALLOWED_TYPES = new Set(Object.keys(EXT_BY_TYPE));
const MAX_BYTES = 10 * 1024 * 1024;

function productImagePrefix(sellerId: string, productId: string): string {
  return `sellers/${sellerId}/products/${productId}/`;
}

export async function requestImageUpload(
  db: Db,
  storage: ObjectStorage,
  ctx: CatalogTenantContext,
  productId: string,
  rawInput: RequestImageUploadInput,
): Promise<{ uploadUrl: string; key: string; expiresAt: Date }> {
  const input = requestImageUploadInputSchema.parse(rawInput);
  await requireProduct(db, ctx, productId);

  const ext = EXT_BY_TYPE[input.contentType];
  if (!ext) {
    throw new Error("Unsupported image type");
  }

  const key = `${productImagePrefix(ctx.sellerId, productId)}${randomUUID()}.${ext}`;
  const result = await storage.createUploadUrl({
    key,
    contentType: input.contentType,
    contentLength: input.sizeBytes,
    expiresInSeconds: 5 * 60,
  });

  return {
    uploadUrl: result.uploadUrl,
    key: result.key,
    expiresAt: result.expiresAt,
  };
}

export async function confirmImageUpload(
  db: Db,
  storage: ObjectStorage,
  jobs: JobEnqueuer,
  ctx: CatalogTenantContext,
  productId: string,
  key: string,
): Promise<ProductImage> {
  await requireProduct(db, ctx, productId);

  const prefix = productImagePrefix(ctx.sellerId, productId);
  if (!key.startsWith(prefix) || key.includes("..")) {
    throw new ProductNotFoundError("image key outside product prefix", {
      sellerId: ctx.sellerId,
      productId,
    });
  }

  const head = await storage.headObject(key);
  if (!head.exists) {
    throw new Error("Uploaded object not found");
  }
  if (!head.contentType || !ALLOWED_TYPES.has(head.contentType)) {
    throw new Error("Uploaded object has unsupported content type");
  }
  if (
    head.contentLength === undefined ||
    head.contentLength <= 0 ||
    head.contentLength > MAX_BYTES
  ) {
    throw new Error("Uploaded object size is invalid");
  }

  const image = await db.transaction(async (tx) => {
    const [agg] = await tx
      .select({ maxPos: max(productImages.position) })
      .from(productImages)
      .where(
        and(
          eq(productImages.productId, productId),
          eq(productImages.sellerId, ctx.sellerId),
        ),
      );

    const nextPosition =
      agg?.maxPos === null || agg?.maxPos === undefined ? 0 : agg.maxPos + 1;

    const [row] = await tx
      .insert(productImages)
      .values({
        id: newId(),
        sellerId: ctx.sellerId,
        productId,
        s3Key: key,
        position: nextPosition,
      })
      .returning();

    await writeAuditEvent(tx, {
      sellerId: ctx.sellerId,
      actorUserId: ctx.userId,
      action: "product_image.confirm",
      targetType: "product_image",
      targetId: row!.id,
      metadata: { key, position: nextPosition },
    });

    return row!;
  });

  await jobs.enqueueImageProcess({
    productImageId: image.id,
    sellerId: ctx.sellerId,
    productId,
    s3Key: key,
  });

  return image;
}

export async function reorderImages(
  db: Db,
  ctx: CatalogTenantContext,
  productId: string,
  orderedImageIds: string[],
): Promise<ProductImage[]> {
  await requireProduct(db, ctx, productId);

  return db.transaction(async (tx) => {
    const existing = await tx.query.productImages.findMany({
      where: and(
        eq(productImages.productId, productId),
        eq(productImages.sellerId, ctx.sellerId),
      ),
      orderBy: [asc(productImages.position)],
    });

    const existingIds = new Set(existing.map((i) => i.id));
    if (
      orderedImageIds.length !== existing.length ||
      orderedImageIds.some((id) => !existingIds.has(id))
    ) {
      throw new Error("Image reorder list does not match existing images");
    }

    const updated: ProductImage[] = [];
    for (let position = 0; position < orderedImageIds.length; position++) {
      const id = orderedImageIds[position]!;
      const [row] = await tx
        .update(productImages)
        .set({ position, updatedAt: new Date() })
        .where(
          and(
            eq(productImages.id, id),
            eq(productImages.sellerId, ctx.sellerId),
          ),
        )
        .returning();
      updated.push(row!);
    }

    await writeAuditEvent(tx, {
      sellerId: ctx.sellerId,
      actorUserId: ctx.userId,
      action: "product_image.reorder",
      targetType: "product",
      targetId: productId,
      metadata: { orderedImageIds },
    });

    return updated.sort((a, b) => a.position - b.position);
  });
}

export async function deleteImage(
  db: Db,
  storage: ObjectStorage,
  ctx: CatalogTenantContext,
  productId: string,
  imageId: string,
): Promise<void> {
  await requireProduct(db, ctx, productId);

  const image = await db.query.productImages.findFirst({
    where: and(
      eq(productImages.id, imageId),
      eq(productImages.productId, productId),
      eq(productImages.sellerId, ctx.sellerId),
    ),
  });
  if (!image) {
    throw new ProductNotFoundError("image not found", {
      sellerId: ctx.sellerId,
      productId,
      imageId,
    });
  }

  await db
    .delete(productImages)
    .where(
      and(
        eq(productImages.id, imageId),
        eq(productImages.sellerId, ctx.sellerId),
      ),
    );

  await storage.deleteObject(image.s3Key);

  await writeAuditEvent(db, {
    sellerId: ctx.sellerId,
    actorUserId: ctx.userId,
    action: "product_image.delete",
    targetType: "product_image",
    targetId: imageId,
    metadata: { key: image.s3Key },
  });
}

export async function listProductImages(
  db: Db,
  ctx: CatalogTenantContext,
  productId: string,
): Promise<ProductImage[]> {
  await requireProduct(db, ctx, productId);
  return db.query.productImages.findMany({
    where: and(
      eq(productImages.productId, productId),
      eq(productImages.sellerId, ctx.sellerId),
    ),
    orderBy: [asc(productImages.position)],
  });
}

/** Used by the worker after sharp measures dimensions. */
export async function updateImageDimensions(
  db: Db,
  productImageId: string,
  sellerId: string,
  dims: { width: number; height: number },
): Promise<void> {
  await db
    .update(productImages)
    .set({
      width: dims.width,
      height: dims.height,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(productImages.id, productImageId),
        eq(productImages.sellerId, sellerId),
      ),
    );
}
