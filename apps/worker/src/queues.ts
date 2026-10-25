export const QUEUE_NAMES = [
  "listing",
  "inventory-sync",
  "order-ingest",
  "token-refresh",
  "heartbeat",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];
