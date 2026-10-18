import { describe, expect, it } from "vitest";
import { clientIp, ipLimit, rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("allows the limit then blocks until the window passes", () => {
    const key = `k-${Math.random()}`;
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) expect(rateLimit(key, 5, 60_000, t + i)).toBe(true);
    expect(rateLimit(key, 5, 60_000, t + 10)).toBe(false);
    expect(rateLimit(key, 5, 60_000, t + 60_001)).toBe(true);
  });

  it("keeps keys independent", () => {
    const t = 2_000_000;
    expect(rateLimit("a-" + t, 1, 1000, t)).toBe(true);
    expect(rateLimit("a-" + t, 1, 1000, t)).toBe(false);
    expect(rateLimit("b-" + t, 1, 1000, t)).toBe(true);
  });

  it("forged forwarding headers are ignored behind the proxy", () => {
    const forged = { "x-forwarded-for": "1.2.3.4", "cf-connecting-ip": "5.6.7.8" };
    expect(clientIp(new Headers({ ...forged, "x-real-ip": "9.9.9.9" }), true)).toBe("9.9.9.9");
    expect(clientIp(new Headers(forged), true)).toBe("local");
  });

  it("dev keeps the forwarded chain", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }), false)).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "cf-connecting-ip": "5.6.7.8", "x-forwarded-for": "1.2.3.4" }), false)).toBe("5.6.7.8");
    expect(clientIp(new Headers({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.2.3.4" }), false)).toBe("9.9.9.9");
    expect(clientIp(new Headers(), false)).toBe("local");
  });

  it("rate limit scale multiplies per-IP limits", () => {
    expect(ipLimit(60, 5)).toBe(300);
    expect(ipLimit(60, 1)).toBe(60);
    expect(ipLimit(20, 0.01)).toBe(1);
  });
});
