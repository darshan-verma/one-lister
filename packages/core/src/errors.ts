/** Thrown when an adjustment/transfer_out would drive on_hand below zero. */
export class InsufficientStockError extends Error {
  override readonly name = "InsufficientStockError";

  constructor(
    message: string,
    readonly context: {
      sellerId: string;
      variantId: string;
      locationId: string;
      onHand: number;
      quantityDelta: number;
      reason: string;
    },
  ) {
    super(message);
  }
}

/** Thrown when a variant/location/listing does not belong to the given seller. */
export class TenantMismatchError extends Error {
  override readonly name = "TenantMismatchError";

  constructor(
    message: string,
    readonly context: {
      sellerId: string;
      variantId?: string;
      locationId?: string;
      channelListingId?: string;
      resource: "variant" | "location" | "listing";
    },
  ) {
    super(message);
  }
}

/** Thrown for invalid movement input (Zod, sign rules, or DB check backstop). */
export class InvalidMovementError extends Error {
  override readonly name = "InvalidMovementError";

  constructor(
    message: string,
    readonly context: {
      sellerId?: string;
      variantId?: string;
      locationId?: string;
      reason?: string;
      quantityDelta?: number;
      idempotencyKey?: string;
      cause?: string;
    } = {},
  ) {
    super(message);
  }
}
