import { describe, expect, it } from "vitest";
import { resolveTheme } from "@/lib/theme";

describe("resolveTheme", () => {
  it("uses the stored choice when valid", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("follows the system without a stored choice", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });

  it("ignores unknown stored values", () => {
    expect(resolveTheme("weird", false)).toBe("light");
    expect(resolveTheme("weird", true)).toBe("dark");
  });
});
