/**
 * Standard GSTIN format (15 chars):
 * 2-digit state + 10-char PAN + entity + 'Z' + checksum.
 */
export const GSTIN_REGEX =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function isValidGstin(value: string): boolean {
  return GSTIN_REGEX.test(value);
}
