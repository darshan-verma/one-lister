import { updateImageDimensions } from "@one-lister/core";
import type { Job } from "bullmq";
import sharp from "sharp";

import { getWorkerDb } from "../db.js";
import type { ImageProcessJobPayload } from "../queues.js";
import { downloadObjectBytes } from "../storage.js";

/**
 * Download the uploaded image, read width/height with sharp, update product_images.
 * Retries/backoff are configured on the BullMQ worker. Logs failures without PII.
 */
export async function handleImageProcess(
  job: Job<ImageProcessJobPayload>,
): Promise<void> {
  const { productImageId, sellerId, s3Key } = job.data;

  try {
    const bytes = await downloadObjectBytes(s3Key);
    const meta = await sharp(bytes).metadata();
    if (!meta.width || !meta.height) {
      throw new Error("sharp could not read image dimensions");
    }

    await updateImageDimensions(getWorkerDb(), productImageId, sellerId, {
      width: meta.width,
      height: meta.height,
    });

    console.log(
      `[image-process] updated dimensions image=${productImageId} ${meta.width}x${meta.height}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[image-process] failed image=${productImageId} seller=${sellerId}: ${message}`,
    );
    throw err;
  }
}
