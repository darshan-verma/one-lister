/** Thrown when optimistic concurrency fails (updatedAt mismatch). */
export class ConcurrentEditError extends Error {
  override readonly name = "ConcurrentEditError";

  constructor(
    message: string,
    readonly context: {
      resource: "product" | "variant";
      id: string;
      expectedUpdatedAt: Date;
      actualUpdatedAt: Date;
    },
  ) {
    super(message);
  }
}

/** Thrown when a product/variant is not found for the seller (tenant isolation). */
export class ProductNotFoundError extends Error {
  override readonly name = "ProductNotFoundError";

  constructor(
    message: string,
    readonly context: {
      sellerId: string;
      productId?: string;
      variantId?: string;
      imageId?: string;
    },
  ) {
    super(message);
  }
}

/** Thrown when setProductStatus(active) is called on an incomplete product. */
export class IncompleteProductError extends Error {
  override readonly name = "IncompleteProductError";

  constructor(
    message: string,
    readonly missing: Array<{ field: string; variantSku?: string; message: string }>,
  ) {
    super(message);
  }
}

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

/** Non-sensitive movement fields compared for idempotency key reuse. */
export type IdempotencyConflictPayload = {
  sellerId: string;
  idempotencyKey: string;
  variantId: string;
  locationId: string;
  quantityDelta: number;
  reason: string;
};

/**
 * Thrown when the same (sellerId, idempotencyKey) is reused with a different
 * variantId, locationId, quantityDelta, or reason.
 */
export class IdempotencyConflictError extends Error {
  override readonly name = "IdempotencyConflictError";

  constructor(
    message: string,
    readonly existing: IdempotencyConflictPayload,
    readonly attempted: IdempotencyConflictPayload,
  ) {
    super(message);
  }
}
