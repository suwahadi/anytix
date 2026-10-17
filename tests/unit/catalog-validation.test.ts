import { describe, expect, it } from "vitest";
import { formFieldInput, mediaPath } from "@/lib/validation/catalog";

function fieldErrors(input: Record<string, unknown>): Record<string, string> {
  const res = formFieldInput.safeParse({ label: "Isian", ...input });
  if (res.success) return {};
  return Object.fromEntries(res.error.issues.map((i) => [i.path.join("."), i.message]));
}

const ORDER = "Harus lebih besar atau sama dengan nilai minimal.";

describe("formFieldInput min/max rules", () => {
  it("rejects a minimum above the maximum for every pair", () => {
    expect(fieldErrors({ type: "short_text", validation: { minLength: 10, maxLength: 5 } })["validation.maxLength"]).toBe(ORDER);
    expect(fieldErrors({ type: "number", validation: { min: 10, max: 5 } })["validation.max"]).toBe(ORDER);
    expect(fieldErrors({ type: "date", validation: { minDate: "2026-12-10", maxDate: "2026-12-01" } })["validation.maxDate"]).toBe(ORDER);
    expect(
      fieldErrors({ type: "checkbox", options: [{ label: "A", value: "a" }, { label: "B", value: "b" }], validation: { minSelected: 2, maxSelected: 1 } })[
        "validation.maxSelected"
      ],
    ).toBe(ORDER);
  });

  it("accepts equal minimum and maximum", () => {
    expect(fieldErrors({ type: "short_text", validation: { minLength: 5, maxLength: 5 } })).toEqual({});
  });

  it("rejects a pattern that is too long or does not compile", () => {
    expect(fieldErrors({ type: "short_text", validation: { pattern: "a".repeat(201) } })["validation.pattern"]).toBe("Pola regex tidak valid.");
    expect(fieldErrors({ type: "short_text", validation: { pattern: "([" } })["validation.pattern"]).toBe("Pola regex tidak valid.");
  });
});

describe("mediaPath", () => {
  it("media path must come from upload", () => {
    expect(mediaPath.safeParse("poster/2026/BjogafyCpWrI").success).toBe(true);
    expect(mediaPath.safeParse(null).success).toBe(true);
    for (const bad of ["https://evil.example/x.png", "poster/2026/../../secret", "avatar/2026/BjogafyCpWrI", "poster/26/BjogafyCpWrI"]) {
      const res = mediaPath.safeParse(bad);
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error.issues[0].message).toBe("Unggah ulang gambar.");
    }
  });
});
