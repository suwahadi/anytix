import { describe, expect, it } from "vitest";
import { buildHeroSlides, GENERIC_BANNERS } from "@/lib/public/hero-slides";

const event = (n: number, posterPath: string | null = `poster/2026/abcdefghij${String(n).padStart(2, "0")}`) => ({
  slug: `event-${n}`,
  title: `Event ${n}`,
  posterPath,
});

describe("buildHeroSlides", () => {
  it("hero falls back to generic banners", () => {
    const slides = buildHeroSlides([]);
    expect(slides).toHaveLength(3);
    expect(slides.every((s) => s.kind === "generic" && s.href === "/events")).toBe(true);
  });

  it("featured events lead and banners fill to three", () => {
    const slides = buildHeroSlides([event(1), event(2)]);
    expect(slides.map((s) => s.kind)).toEqual(["event", "event", "generic"]);
    expect(slides[0].href).toBe("/events/event-1");
  });

  it("events without a poster are not hero slides", () => {
    const slides = buildHeroSlides([event(1), event(2, null), event(3)]);
    expect(slides.map((s) => s.kind)).toEqual(["event", "event", "generic"]);
    expect(slides.filter((s) => s.kind === "event").map((s) => s.href)).toEqual(["/events/event-1", "/events/event-3"]);
  });

  it("hero is capped at six slides", () => {
    const slides = buildHeroSlides(Array.from({ length: 8 }, (_, i) => event(i + 1)));
    expect(slides).toHaveLength(6);
    expect(slides.every((s) => s.kind === "event")).toBe(true);
  });

  it("generic banners use fixed unsplash urls", () => {
    expect(GENERIC_BANNERS).toHaveLength(3);
    for (const b of GENERIC_BANNERS) {
      expect(b.imageUrl.startsWith("https://images.unsplash.com/photo-")).toBe(true);
      expect(b.imageUrl).not.toContain("source.unsplash.com");
      expect(b.alt.length).toBeGreaterThan(0);
    }
  });
});
