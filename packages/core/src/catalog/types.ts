export type CatalogTenantContext = {
  sellerId: string;
  userId: string;
};

export type CompletenessMissing = {
  field: string;
  variantSku?: string;
  message: string;
};

export type CompletenessResult = {
  complete: boolean;
  missing: CompletenessMissing[];
};

/** Minimal job enqueue so core stays free of BullMQ. */
export type JobEnqueuer = {
  enqueueImageProcess(payload: {
    productImageId: string;
    sellerId: string;
    productId: string;
    s3Key: string;
    /** User who confirmed the upload — used for reject audit (FK to user). */
    actorUserId: string;
  }): Promise<void>;
};
