import { describe, expect, it } from "vitest";
import { formatCountdown, remainingMs } from "@/lib/booking/countdown";

describe("remainingMs", () => {
  const expiresAt = "2026-12-01T10:03:00.000Z";
  const serverNow = "2026-12-01T10:00:00.000Z";

  it("countdown ignores device clock offset", () => {
    const fast = Date.parse(serverNow) + 30_000;
    const slow = Date.parse(serverNow) - 30_000;
    expect(remainingMs(expiresAt, serverNow, fast, fast + 60_000)).toBe(120_000);
    expect(remainingMs(expiresAt, serverNow, slow, slow + 60_000)).toBe(120_000);
  });

  it("never goes below zero", () => {
    const t = Date.parse(serverNow);
    expect(remainingMs(expiresAt, serverNow, t, t + 10 * 60_000)).toBe(0);
  });
});

describe("formatCountdown", () => {
  it("shows minutes and seconds, rounding seconds up", () => {
    expect(formatCountdown(179_001)).toBe("03:00");
    expect(formatCountdown(59_000)).toBe("00:59");
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(61 * 60_000)).toBe("61:00");
  });
});
