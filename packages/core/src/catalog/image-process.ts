import { productImages, type Db } from "@one-lister/db";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";

import { writeAuditEvent } from "../audit/write-audit-event.js";
import type { ObjectStorage } from "../storage/types.js";

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

const FORMAT_BY_EXT: Record<string, string> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
};

/** Map key extension to the sharp format name (jpeg/png/webp). */
export function expectedFormatFromKey(s3Key: string): string | null {
  const base = s3Key.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  return FORMAT_BY_EXT[ext] ?? null;
}

export type VerifyImageResult =
  | { ok: true; width: number; height: number; format: string }
  | { ok: false; reason: string };

/**
 * Validate bytes with sharp: must be jpeg/png/webp and match the key extension.
 */
export async function verifyImageBytes(
  bytes: Buffer,
  s3Key: string,
): Promise<VerifyImageResult> {
  const expected = expectedFormatFromKey(s3Key);
  if (!expected || !ALLOWED_FORMATS.has(expected)) {
    return { ok: false, reason: "unsupported or missing key extension" };
  }

  try {
    const meta = await sharp(bytes).metadata();
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
      return {
        ok: false,
        reason: `detected format "${meta.format ?? "unknown"}" is not allowed`,
      };
    }
    if (meta.format !== expected) {
      return {
        ok: false,
        reason: `format mismatch: key expects ${expected}, got ${meta.format}`,
      };
    }
    if (!meta.width || !meta.height) {
      return { ok: false, reason: "missing dimensions" };
    }
    return {
      ok: true,
      width: meta.width,
      height: meta.height,
      format: meta.format,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `sharp failed: ${message}` };
  }
}

/**
 * Mark image ready with dimensions after successful verification.
 */
export async function markImageReady(
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
      status: "ready",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(productImages.id, productImageId),
        eq(productImages.sellerId, sellerId),
      ),
    );
}

/**
 * Reject a bad upload: delete S3 object, delete product_images row, audit.
 */
export async function rejectProductImage(
  db: Db,
  storage: ObjectStorage,
  input: {
    productImageId: string;
    sellerId: string;
    productId: string;
    s3Key: string;
    reason: string;
    /** Must be a real user id (audit_events FK). */
    actorUserId: string;
  },
): Promise<void> {
  await db
    .delete(productImages)
    .where(
      and(
        eq(productImages.id, input.productImageId),
        eq(productImages.sellerId, input.sellerId),
      ),
    );

  try {
    await storage.deleteObject(input.s3Key);
  } catch {
    // Object may already be gone; row is removed either way.
  }

  await writeAuditEvent(db, {
    sellerId: input.sellerId,
    actorUserId: input.actorUserId,
    action: "product_image.rejected",
    targetType: "product_image",
    targetId: input.productImageId,
    metadata: {
      productId: input.productId,
      key: input.s3Key,
      reason: input.reason,
    },
  });
}

/**
 * Verify bytes and either mark ready or reject (delete row + S3 + audit).
 */
export async function verifyAndFinalizeImage(
  db: Db,
  storage: ObjectStorage,
  input: {
    productImageId: string;
    sellerId: string;
    productId: string;
    s3Key: string;
    bytes: Buffer;
    actorUserId: string;
  },
): Promise<"ready" | "rejected"> {
  const verified = await verifyImageBytes(input.bytes, input.s3Key);
  if (!verified.ok) {
    await rejectProductImage(db, storage, {
      productImageId: input.productImageId,
      sellerId: input.sellerId,
      productId: input.productId,
      s3Key: input.s3Key,
      reason: verified.reason,
      actorUserId: input.actorUserId,
    });
    return "rejected";
  }

  await markImageReady(db, input.productImageId, input.sellerId, {
    width: verified.width,
    height: verified.height,
  });
  return "ready";
}
