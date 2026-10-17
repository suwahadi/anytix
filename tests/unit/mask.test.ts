import { describe, expect, it } from "vitest";
import { maskEmail, maskIdentity } from "@/lib/mask";

describe("mask", () => {
  it("keeps the first and last four digits of an identity number", () => {
    expect(maskIdentity("3201234567890001")).toBe("3201********0001");
  });

  it("keeps only the last two characters of a short identity number", () => {
    expect(maskIdentity("A1234567")).toBe("******67");
  });

  it("masks the local part of an email", () => {
    expect(maskEmail("budi.santoso@example.com")).toBe("b***@example.com");
    expect(maskEmail("not-an-email")).toBe("***");
  });
});
