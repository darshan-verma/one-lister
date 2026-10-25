/** Slugify a product title for SKU prefixes. */
export function slugifyTitle(title: string): string {
  const slug = title
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? slug : "PRODUCT";
}

/** Build a suggested SKU from product slug + option values. */
export function suggestSku(
  productSlug: string,
  attributes: Record<string, string>,
): string {
  const parts = [productSlug];
  for (const value of Object.values(attributes)) {
    const cleaned = value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (cleaned) parts.push(cleaned);
  }
  return parts.join("-").slice(0, 100);
}

/**
 * Ensure SKU is unique among `existing` (seller-scoped). Appends -2, -3, …
 */
export function dedupeSku(desired: string, existing: Set<string>): string {
  const base = desired.toUpperCase();
  if (!existing.has(base)) {
    existing.add(base);
    return base;
  }
  let n = 2;
  while (n < 10_000) {
    const candidate = `${base}-${n}`.slice(0, 100);
    if (!existing.has(candidate)) {
      existing.add(candidate);
      return candidate;
    }
    n += 1;
  }
  throw new Error("unable to generate unique SKU");
}

/** Cartesian product of option value arrays. */
export function cartesianOptions(
  options: Array<{ name: string; values: string[] }>,
): Array<Record<string, string>> {
  if (options.length === 0) return [{}];

  let combos: Array<Record<string, string>> = [{}];
  for (const opt of options) {
    const next: Array<Record<string, string>> = [];
    for (const combo of combos) {
      for (const value of opt.values) {
        next.push({ ...combo, [opt.name]: value });
      }
    }
    combos = next;
  }
  return combos;
}
