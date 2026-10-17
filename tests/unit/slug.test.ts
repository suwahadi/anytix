import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and joins words with dashes", () => {
    expect(slugify("Konser Musik Jazz 2026!")).toBe("konser-musik-jazz-2026");
  });

  it("strips accents and punctuation", () => {
    expect(slugify("Pameran Seni & Budaya, Édisi Ke-2")).toBe("pameran-seni-budaya-edisi-ke-2");
  });

  it("falls back when nothing usable remains", () => {
    expect(slugify("🎉🎉")).toBe("event");
    expect(slugify("   ")).toBe("event");
  });

  it("caps the length at 80 without a trailing dash", () => {
    const slug = slugify("kata ".repeat(40));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });
});
