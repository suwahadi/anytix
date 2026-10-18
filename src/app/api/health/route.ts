import { connection, NextResponse } from "next/server";
import { sql } from "@/lib/db";

const STALE_SEC = 300;

/** Uptime probe: 503 when the database is unreachable or a due job has waited over 5 minutes (the worker is down). */
export async function GET() {
  await connection();
  let body: { ok: boolean; db: "ok" | "down"; oldestQueuedJobSec: number | null };
  try {
    const [row] = await sql<{ age: number | null }[]>`
      select floor(extract(epoch from now() - min(run_at)))::int as age from jobs where status = 'queued' and run_at <= now()`;
    body = { ok: (row.age ?? 0) <= STALE_SEC, db: "ok", oldestQueuedJobSec: row.age };
  } catch {
    body = { ok: false, db: "down", oldestQueuedJobSec: null };
  }
  return NextResponse.json(body, { status: body.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
