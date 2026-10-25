/** Convert rupees (decimal string/number input as paise integer elsewhere) to paise. */
export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) {
    throw new Error("rupees must be a finite number");
  }
  return Math.round(rupees * 100);
}

/** Format integer paise as an INR display string without floating money math. */
export function formatPaise(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new Error("paise must be an integer");
  }
  const sign = paise < 0 ? "-" : "";
  const absolute = Math.abs(paise);
  const rupees = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  return `${sign}₹${rupees}.${remainder.toString().padStart(2, "0")}`;
}
