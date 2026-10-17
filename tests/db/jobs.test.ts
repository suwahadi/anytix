import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db";
import { claimJobs, enqueueJob, failJob } from "@/lib/jobs";
import { runOnce } from "../../worker/run-once";

const key = () => `test:${randomUUID()}`;

async function jobStatus(dedupeKey: string) {
  const [row] = await sql<{ status: string; attempts: number; run_at: Date; last_error: string | null }[]>`
    select status, attempts, run_at, last_error from jobs where dedupe_key = ${dedupeKey}`;
  return row;
}

beforeEach(async () => {
  await sql`update jobs set run_at = now() + interval '1 day' where status = 'queued' and dedupe_key not like 'test:%'`;
  await sql`delete from jobs where dedupe_key like 'test:%'`;
});

afterAll(async () => {
  await sql`delete from jobs where dedupe_key like 'test:%'`;
  await sql`update jobs set run_at = now() where status = 'queued' and run_at > now() + interval '23 hours'`;
});

describe("jobs", () => {
  it("enqueue dedupes by key", async () => {
    const k = key();
    expect(await enqueueJob("test", { a: 1 }, k)).toBe(true);
    expect(await enqueueJob("test", { a: 2 }, k)).toBe(false);
  });

  it("claim is exclusive", async () => {
    const k = key();
    await enqueueJob("test", {}, k);
    const [a, b] = await Promise.all([claimJobs(1), claimJobs(1)]);
    const hits = [...a, ...b].filter((j) => j.type === "test");
    expect(hits).toHaveLength(1);
    expect((await jobStatus(k)).status).toBe("running");
  });

  it("retry then fail", async () => {
    const k = key();
    await enqueueJob("test", {}, k);
    for (let i = 1; i <= 5; i++) {
      await sql`update jobs set run_at = now() where dedupe_key = ${k}`;
      const [job] = (await claimJobs(10)).filter((j) => j.type === "test");
      expect(job.attempts).toBe(i);
      await failJob(job, `boom ${i}`);
      const row = await jobStatus(k);
      if (i === 1) {
        const delta = row.run_at.getTime() - Date.now();
        expect(delta).toBeGreaterThan(20_000);
        expect(delta).toBeLessThan(40_000);
      }
      expect(row.status).toBe(i < 5 ? "queued" : "failed");
      expect(row.last_error).toBe(`boom ${i}`);
    }
  });

  it("runOnce runs handler and completes", async () => {
    const k = key();
    await enqueueJob("test", { hello: "dunia" }, k);
    const seen: unknown[] = [];
    await runOnce({ test: async (payload) => void seen.push(payload) });
    expect(seen).toEqual([{ hello: "dunia" }]);
    expect((await jobStatus(k)).status).toBe("done");
  });

  it("runOnce fails jobs without handler", async () => {
    const k = key();
    await enqueueJob("test", {}, k);
    await runOnce({});
    const row = await jobStatus(k);
    expect(row.status).toBe("queued");
    expect(row.last_error).toBe("no handler");
  });
});
