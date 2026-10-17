import { afterEach, describe, expect, it, vi } from "vitest";

const env = { TURNSTILE_SECRET_KEY: "0x4AAAAAAA-real-secret", APP_URL: "https://anytix.web.id" };
vi.mock("@/lib/env", () => ({ getEnv: () => env }));

const { verifyTurnstile } = await import("@/lib/turnstile");

function answer(body: object) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body))));
}

afterEach(() => {
  vi.unstubAllGlobals();
  env.TURNSTILE_SECRET_KEY = "0x4AAAAAAA-real-secret";
});

describe("verifyTurnstile", () => {
  it("accepts a success for our hostname", async () => {
    answer({ success: true, hostname: "anytix.web.id" });
    expect(await verifyTurnstile("t", null)).toBe(true);
  });

  it("foreign hostname is rejected", async () => {
    answer({ success: true, hostname: "evil.example" });
    expect(await verifyTurnstile("t", null)).toBe(false);
  });

  it("test secret skips the hostname check", async () => {
    env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
    answer({ success: true, hostname: "example.com" });
    expect(await verifyTurnstile("t", null)).toBe(true);
  });
});
