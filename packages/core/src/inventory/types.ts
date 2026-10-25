import type { InventoryLevel, InventoryMovement } from "@one-lister/db";

export const MOVEMENT_REASONS = [
  "initial",
  "receive",
  "adjustment",
  "sale",
  "cancellation",
  "return_restock",
  "transfer_in",
  "transfer_out",
] as const;

export type MovementReason = (typeof MOVEMENT_REASONS)[number];

/** Reasons that require a strictly positive quantity_delta. */
export const POSITIVE_ONLY_REASONS = [
  "initial",
  "receive",
  "transfer_in",
  "return_restock",
  "cancellation",
] as const satisfies readonly MovementReason[];

/** Reasons that require a strictly negative quantity_delta. */
export const NEGATIVE_ONLY_REASONS = [
  "sale",
  "transfer_out",
] as const satisfies readonly MovementReason[];

export type RecordMovementInput = {
  sellerId: string;
  variantId: string;
  locationId: string;
  quantityDelta: number;
  reason: MovementReason;
  sourceType: string;
  sourceRef?: string;
  idempotencyKey: string;
  note?: string;
  createdBy?: string;
};

export type RecordMovementResult = {
  applied: boolean;
  movement: InventoryMovement;
  level: InventoryLevel;
  negativeStock: boolean;
};

export type RebuiltLevelDisagreement = {
  sellerId: string;
  variantId: string;
  locationId: string;
  previousOnHand: number | null;
  onHand: number;
  previousVersion: number | null;
  version: number;
};
