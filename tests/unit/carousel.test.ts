import { describe, expect, it } from "vitest";
import { shouldAutoplay } from "@/lib/carousel";

const base = { enabled: true, reducedMotion: false, paused: false, hovered: false, focused: false, touched: false, slideCount: 3 };

describe("shouldAutoplay", () => {
  it("autoplay stops on focus, hover, touch, pause and reduced motion", () => {
    expect(shouldAutoplay(base)).toBe(true);
    for (const flag of ["reducedMotion", "paused", "hovered", "focused", "touched"] as const) {
      expect(shouldAutoplay({ ...base, [flag]: true })).toBe(false);
    }
    expect(shouldAutoplay({ ...base, slideCount: 1 })).toBe(false);
    expect(shouldAutoplay({ ...base, enabled: false })).toBe(false);
  });
});
