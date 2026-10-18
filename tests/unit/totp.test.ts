import { describe, expect, it } from "vitest";
import { generateTotpSecret, totpCode, totpStep, totpUri, verifyTotp } from "@/lib/totp";

const s = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totp", () => {
  it("matches RFC 6238 SHA-1 vectors", () => {
    expect(totpCode(s, 59_000)).toBe("287082");
    expect(totpCode(s, 1111111109_000)).toBe("081804");
  });

  it("accepts one step of drift only", () => {
    expect(verifyTotp(s, "287082", 89_000)).toBe(true);
    expect(verifyTotp(s, "287082", 149_000)).toBe(false);
    expect(verifyTotp(s, "28708", 59_000)).toBe(false);
  });

  it("reports the matched time step so a used code can be refused", () => {
    expect(totpStep(s, "287082", 59_000)).toBe(1);
    expect(totpStep(s, "287082", 89_000)).toBe(1);
    expect(totpStep(s, "287082", 149_000)).toBeNull();
    expect(totpStep(s, "abc", 59_000)).toBeNull();
  });

  it("generates base32 secrets of 20 bytes", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(totpCode(secret, Date.now())).toMatch(/^\d{6}$/);
  });

  it("builds an otpauth uri", () => {
    expect(totpUri(s, "admin@example.com", "Anytix")).toBe(
      `otpauth://totp/Anytix:admin%40example.com?secret=${s}&issuer=Anytix&algorithm=SHA1&digits=6&period=30`,
    );
  });
});
