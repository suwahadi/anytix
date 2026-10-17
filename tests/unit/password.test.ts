import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password", () => {
  it("verifies the right password only", async () => {
    const hash = await hashPassword("rahasia123");
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifyPassword("rahasia123", hash)).toBe(true);
    expect(await verifyPassword("salah", hash)).toBe(false);
  });

  it("salts each hash", async () => {
    expect(await hashPassword("rahasia123")).not.toBe(await hashPassword("rahasia123"));
  });

  it("rejects malformed stored hash", async () => {
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});
