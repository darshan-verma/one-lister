import { describe, expect, it } from "vitest";

import { getClientIp } from "./http";

describe("getClientIp", () => {
  it("returns unknown when TRUSTED_PROXY_COUNT is 0 (dev)", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.1, 10.0.0.1",
    });
    expect(getClientIp(headers, 0)).toBe("unknown");
  });

  it("returns unknown when X-Forwarded-For is missing", () => {
    expect(getClientIp(new Headers(), 1)).toBe("unknown");
  });

  it("returns unknown when the chain is shorter than TRUSTED_PROXY_COUNT", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.1" });
    expect(getClientIp(headers, 2)).toBe("unknown");
  });

  it("with 1 trusted proxy (ALB), takes the rightmost entry — not the spoofed leftmost", () => {
    // Client sent spoofed IP; ALB appended the real connecting IP.
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4, 203.0.113.50",
    });
    expect(getClientIp(headers, 1)).toBe("203.0.113.50");
  });

  it("never returns the leftmost entry when multiple hops exist", () => {
    const headers = new Headers({
      "x-forwarded-for": "spoofed.leftmost, middle, real.client",
    });
    expect(getClientIp(headers, 1)).toBe("real.client");
    expect(getClientIp(headers, 1)).not.toBe("spoofed.leftmost");
  });

  it("with 2 trusted proxies, takes the 2nd from the right", () => {
    const headers = new Headers({
      "x-forwarded-for": "client, proxy-a, proxy-b",
    });
    expect(getClientIp(headers, 2)).toBe("proxy-a");
  });

  it("ignores blank segments", () => {
    const headers = new Headers({
      "x-forwarded-for": "spoofed, , 203.0.113.9",
    });
    expect(getClientIp(headers, 1)).toBe("203.0.113.9");
  });
});
