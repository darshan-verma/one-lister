export const QUEUE_NAMES = [
  "listing",
  "inventory-sync",
  "order-ingest",
  "token-refresh",
  "image-process",
  "heartbeat",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export type ImageProcessJobPayload = {
  productImageId: string;
  sellerId: string;
  productId: string;
  s3Key: string;
  actorUserId: string;
};
