import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:6543/postgres",
  COOKIE_SECRET: "c".repeat(43),
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
};

describe("parseEnv", () => {
  it("rejects short COOKIE_SECRET", () => {
    expect(() => parseEnv({ ...valid, COOKIE_SECRET: "x" })).toThrow(/COOKIE_SECRET/);
  });

  it("rejects DATA_ENCRYPTION_KEY that is not 32 bytes", () => {
    expect(() => parseEnv({ ...valid, DATA_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") })).toThrow(
      /DATA_ENCRYPTION_KEY/,
    );
  });

  it("applies Turnstile test keys by default", () => {
    const env = parseEnv(valid);
    expect(env.TURNSTILE_SITE_KEY).toBe("1x00000000000000000000AA");
    expect(env.TURNSTILE_SECRET_KEY).toBe("1x0000000000000000000000000000000AA");
    expect(env.MIDTRANS_IS_PRODUCTION).toBe(false);
    expect(env.APP_URL).toBe("http://localhost:3000");
  });
});
