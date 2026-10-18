import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ getEnv: () => ({ APP_URL: "http://localhost:3000" }) }));

const { foreignOrigin } = await import("@/lib/admin-route");

const post = (origin: string, host: string) => new NextRequest(`http://${host}/api/holds`, { method: "POST", headers: { origin, host } });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("foreignOrigin", () => {
  it("dev accepts the address the browser actually used", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(foreignOrigin(post("http://127.0.0.1:3000", "127.0.0.1:3000"))).toBe(false);
    expect(foreignOrigin(post("http://10.20.59.231:3000", "10.20.59.231:3000"))).toBe(false);
  });

  it("dev still rejects another site", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(foreignOrigin(post("https://evil.example", "127.0.0.1:3000"))).toBe(true);
  });

  it("production only trusts APP_URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(foreignOrigin(post("http://127.0.0.1:3000", "127.0.0.1:3000"))).toBe(true);
    expect(foreignOrigin(post("http://localhost:3000", "localhost:3000"))).toBe(false);
  });
});
