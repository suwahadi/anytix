import { describe, expect, it } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

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
});
