import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { sql } from "@/lib/db";

vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));

async function withJob(runAt: string, fn: () => Promise<void>) {
  const key = `health-test:${randomUUID()}`;
  await sql`insert into jobs (type, payload, dedupe_key, run_at) values ('health-test', '{}', ${key}, now() + ${runAt}::interval)`;
  try {
    await fn();
  } finally {
    await sql`delete from jobs where dedupe_key = ${key}`;
  }
}

describe("health", () => {
  it("healthy when queue is fresh", async () => {
    const res = await health();
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, db: "ok" });
  });

  it("stale queue is unhealthy", async () => {
    await withJob("-10 minutes", async () => {
      const res = await health();
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.oldestQueuedJobSec).toBeGreaterThanOrEqual(590);
    });
  });

  it("future jobs do not count", async () => {
    await withJob("10 minutes", async () => {
      expect((await health()).status).toBe(200);
    });
  });
});
