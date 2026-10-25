/**
 * Resolve the client IP from request headers using TRUSTED_PROXY_COUNT.
 *
 * X-Forwarded-For is client-controlled except for entries appended by our
 * proxies. With N trusted proxies, take the Nth entry from the right
 * (1-indexed). N=0 (default in dev) means do not trust XFF → "unknown".
 * Never use the leftmost entry as a shortcut when N > 0.
 */
export function getClientIp(
  headers: Headers | { get(name: string): string | null },
  trustedProxyCount: number,
): string {
  if (!Number.isInteger(trustedProxyCount) || trustedProxyCount < 0) {
    return "unknown";
  }

  // No trusted proxy: the entire XFF chain is client-controlled.
  if (trustedProxyCount === 0) {
    return "unknown";
  }

  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) {
    return "unknown";
  }

  const parts = forwarded
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Need at least N entries: the Nth from the right is the client IP
  // as seen by the outermost trusted proxy.
  if (parts.length < trustedProxyCount) {
    return "unknown";
  }

  const index = parts.length - trustedProxyCount;
  return parts[index] ?? "unknown";
}
