import { verifyAndFinalizeImage } from "@one-lister/core";
import type { Job } from "bullmq";

import { getWorkerDb } from "../db.js";
import type { ImageProcessJobPayload } from "../queues.js";
import { downloadObjectBytes, getObjectStorage } from "../storage.js";

/**
 * Download the uploaded image, verify real image content with sharp, then
 * mark ready or reject (delete S3 + row + audit). Content rejections do not
 * throw — the job completes after cleanup so BullMQ does not retry forever.
 */
export async function handleImageProcess(
  job: Job<ImageProcessJobPayload>,
): Promise<void> {
  const { productImageId, sellerId, productId, s3Key, actorUserId } = job.data;

  let bytes: Buffer;
  try {
    bytes = await downloadObjectBytes(s3Key);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[image-process] download failed image=${productImageId} seller=${sellerId}: ${message}`,
    );
    throw err;
  }

  try {
    const outcome = await verifyAndFinalizeImage(
      getWorkerDb(),
      getObjectStorage(),
      {
        productImageId,
        sellerId,
        productId,
        s3Key,
        bytes,
        actorUserId,
      },
    );

    if (outcome === "rejected") {
      console.log(
        `[image-process] rejected image=${productImageId} seller=${sellerId}`,
      );
      return;
    }

    console.log(`[image-process] ready image=${productImageId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[image-process] failed image=${productImageId} seller=${sellerId}: ${message}`,
    );
    throw err;
  }
}
