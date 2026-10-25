import { describe, expect, it } from "vitest";

import { formatPaise, rupeesToPaise } from "./money.js";

describe("rupeesToPaise", () => {
  it("converts whole rupees", () => {
    expect(rupeesToPaise(10)).toBe(1000);
  });

  it("rounds fractional rupees to nearest paise", () => {
    expect(rupeesToPaise(10.005)).toBe(1001);
  });
});

describe("formatPaise", () => {
  it("formats positive amounts", () => {
    expect(formatPaise(1000)).toBe("₹10.00");
    expect(formatPaise(105)).toBe("₹1.05");
  });

  it("formats negative amounts", () => {
    expect(formatPaise(-50)).toBe("-₹0.50");
  });
});
