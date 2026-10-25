import {
  ConcurrentEditError,
  IncompleteProductError,
  InvitationError,
  ProductNotFoundError,
} from "@one-lister/core";

const GENERIC = "Something went wrong";

function isNextControlFlow(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    (String((err as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT") ||
      String((err as { digest?: unknown }).digest).startsWith("NEXT_NOT_FOUND"))
  );
}

const INVITATION_MESSAGES: Record<InvitationError["code"], string> = {
  not_found: "Invitation not found.",
  expired: "This invitation has expired.",
  already_accepted: "This invitation was already used.",
  email_mismatch: "Sign in with the email address this invitation was sent to.",
  already_member: "You are already a member of this seller.",
};

/**
 * Map known typed errors to user-facing messages. Logs unexpected errors
 * server-side and returns a generic message — never raw err.message.
 * Re-throws Next.js redirect/notFound control-flow errors.
 */
export function mapActionError(err: unknown, logLabel: string): string {
  if (isNextControlFlow(err)) {
    throw err;
  }

  if (err instanceof InvitationError) {
    return INVITATION_MESSAGES[err.code] ?? GENERIC;
  }

  if (err instanceof ConcurrentEditError) {
    return "This product was changed by someone else — reload to see the latest version.";
  }

  if (err instanceof IncompleteProductError) {
    return "Product is incomplete and cannot be activated.";
  }

  if (err instanceof ProductNotFoundError) {
    return "Product not found.";
  }

  if (err instanceof Error && err.message === "invalid GSTIN format") {
    return "Invalid GSTIN format.";
  }

  console.error(`[${logLabel}]`, err instanceof Error ? err.message : err);
  return GENERIC;
}
