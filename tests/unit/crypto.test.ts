import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, randomToken, sign, verify } from "@/lib/crypto";

const k = randomBytes(32);
const s = "s".repeat(32);

describe("crypto", () => {
  it("roundtrip", () => {
    expect(decrypt(encrypt("3201234567890001", k), k)).toBe("3201234567890001");
  });

  it("fresh iv", () => {
    expect(encrypt("abc", k).equals(encrypt("abc", k))).toBe(false);
  });

  it("tamper", () => {
    const data = encrypt("abc", k);
    data[data.length - 1] ^= 1;
    expect(() => decrypt(data, k)).toThrow();
  });

  it("sign/verify", () => {
    expect(verify(sign("abc", s), s)).toBe("abc");
    expect(verify("abc.bad", s)).toBeNull();
    expect(verify(sign("abc", s), "t".repeat(32))).toBeNull();
    expect(verify("no-dot", s)).toBeNull();
  });

  it("randomToken", () => {
    const t = randomToken();
    expect(t).toHaveLength(22);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
