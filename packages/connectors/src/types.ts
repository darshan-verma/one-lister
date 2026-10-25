/** Opaque placeholder until marketplace auth models exist. */
export type AuthorizationCredentials = Record<string, unknown>;

/** Opaque placeholder for OAuth / token payloads (never log these). */
export type TokenSet = Record<string, unknown>;

/** Opaque placeholder for category / attribute schemas. */
export type CategorySchema = Record<string, unknown>;

/** Opaque placeholder for a listing payload before publish. */
export type ListingDraft = Record<string, unknown>;

/** Opaque placeholder for listing validation results. */
export type ListingValidationResult = {
  ok: boolean;
  errors: string[];
};

/** Opaque placeholder for a published listing reference. */
export type PublishedListing = Record<string, unknown>;

/** Opaque placeholder for stock update input. */
export type StockUpdate = Record<string, unknown>;

/** Opaque placeholder for price update input (money in paise at the domain layer). */
export type PriceUpdate = Record<string, unknown>;

/** Opaque placeholder for a marketplace order. */
export type MarketplaceOrder = Record<string, unknown>;

/** Opaque placeholder for a marketplace return. */
export type MarketplaceReturn = Record<string, unknown>;

/** Opaque placeholder for inbound webhook payloads. */
export type WebhookPayload = Record<string, unknown>;

/** Opaque placeholder for webhook handling outcomes. */
export type WebhookResult = Record<string, unknown>;

export type MarketplaceCapabilities = {
  api: boolean;
  fileUpload: boolean;
  webhooks: boolean;
};
