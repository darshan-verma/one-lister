import type {
  AuthorizationCredentials,
  CategorySchema,
  ListingDraft,
  ListingValidationResult,
  MarketplaceCapabilities,
  MarketplaceOrder,
  MarketplaceReturn,
  PriceUpdate,
  PublishedListing,
  StockUpdate,
  TokenSet,
  WebhookPayload,
  WebhookResult,
} from "./types.js";

/**
 * Shared contract every marketplace connector must implement.
 * Implementations live under amazon/, flipkart/, meesho/, ajio/ — not yet built.
 */
export interface MarketplaceConnector {
  readonly capabilities: MarketplaceCapabilities;

  authorize(credentials: AuthorizationCredentials): Promise<TokenSet>;

  refreshToken(tokens: TokenSet): Promise<TokenSet>;

  getCategorySchema(categoryId: string): Promise<CategorySchema>;

  validateListing(draft: ListingDraft): Promise<ListingValidationResult>;

  publishListing(draft: ListingDraft): Promise<PublishedListing>;

  updateStock(update: StockUpdate): Promise<void>;

  updatePrice(update: PriceUpdate): Promise<void>;

  fetchOrders(since: Date): Promise<MarketplaceOrder[]>;

  fetchReturns(since: Date): Promise<MarketplaceReturn[]>;

  handleWebhook(payload: WebhookPayload): Promise<WebhookResult>;
}
