import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createHold } from "@/app/api/holds/route";
import { DELETE as deleteHold, GET as getHold } from "@/app/api/holds/[id]/route";
import { POST as quote } from "@/app/api/holds/[id]/quote/route";
import { sql } from "@/lib/db";
import { verifyTurnstile } from "@/lib/turnstile";
import { newVisitorCookie } from "@/lib/visitor";
import { cleanupTestEvents, createTestEvent, inventoryRow } from "./helpers";

vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: vi.fn(async () => true) }));

afterAll(async () => {
  await cleanupTestEvents();
});

beforeEach(() => {
  vi.mocked(verifyTurnstile).mockResolvedValue(true);
});

function request(url: string, opts: { method?: string; vid?: string | null; body?: unknown; key?: string | null; ip?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": opts.ip ?? "10.0.0.1" };
  if (opts.vid) headers.cookie = `vid=${opts.vid}`;
  if (opts.key) headers["idempotency-key"] = opts.key;
  return new NextRequest(`http://localhost${url}`, {
    method: opts.method ?? "POST",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

const noParams = { params: Promise.resolve({}) };
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

async function hold(vid: string, eventId: number, inventoryId: number, qty: number, key = randomUUID()) {
  return createHold(request("/api/holds", { vid, key, body: { eventId, items: [{ inventoryId, qty }], turnstileToken: "t" } }), noParams);
}

describe("holds API", () => {
  it("creates a hold", async () => {
    const ev = await createTestEvent({ categories: [{ name: "Reguler", capacity: 10 }] });
    const res = await hold(newVisitorCookie().value, ev.eventId, ev.inventoryIds[0], 2);
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    const minutes = (Date.parse(body.expiresAt) - Date.parse(body.serverNow)) / 60_000;
    expect(minutes).toBeGreaterThan(2.8);
    expect(minutes).toBeLessThanOrEqual(3.01);
    expect((await inventoryRow(ev.inventoryIds[0])).held).toBe(2);
  });

  it("replayed idempotency key skips turnstile", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const vid = newVisitorCookie().value;
    const key = randomUUID();
    const first = await (await hold(vid, ev.eventId, ev.inventoryIds[0], 1, key)).json();
    vi.mocked(verifyTurnstile).mockResolvedValue(false);
    const again = await hold(vid, ev.eventId, ev.inventoryIds[0], 1, key);
    expect(again.status).toBe(200);
    expect((await again.json()).holdId).toBe(first.holdId);
  });

  it("turnstile failure is 403", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    vi.mocked(verifyTurnstile).mockResolvedValue(false);
    const res = await hold(newVisitorCookie().value, ev.eventId, ev.inventoryIds[0], 1);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Verifikasi keamanan gagal. Coba lagi.");
  });

  it("missing idempotency key is 422", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const res = await createHold(
      request("/api/holds", { vid: newVisitorCookie().value, key: null, body: { eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }], turnstileToken: "t" } }),
      noParams,
    );
    expect(res.status).toBe(422);
  });

  it("sold out names the category", async () => {
    const ev = await createTestEvent({ categories: [{ name: "Reguler", capacity: 1 }] });
    const res = await hold(newVisitorCookie().value, ev.eventId, ev.inventoryIds[0], 2);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "Kuota Reguler tidak cukup, sisa 1", code: "SOLD_OUT", available: 1 });
  });

  it("rate limited after 10", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 50 }] });
    const vid = newVisitorCookie().value;
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await hold(vid, ev.eventId, ev.inventoryIds[0], 1)).status);
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("get hold view is owner only", async () => {
    const ev = await createTestEvent({ categories: [{ name: "Reguler", capacity: 10 }] });
    await sql`insert into form_fields (event_id, key, label, type, required, position) values (${ev.eventId}, 'kota', 'Kota asal', 'short_text', true, 1)`;
    await sql`insert into form_fields (event_id, key, label, type, required, position, is_active) values (${ev.eventId}, 'lama', 'Lama', 'short_text', false, 2, false)`;
    const vid = newVisitorCookie().value;
    const { holdId } = await (await hold(vid, ev.eventId, ev.inventoryIds[0], 2)).json();

    const res = await getHold(request(`/api/holds/${holdId}`, { method: "GET", vid }), idParams(holdId));
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view).toMatchObject({ id: holdId, status: "held", serviceFee: 5000, orderUuid: null, hasIdentityField: false });
    expect(view.items).toEqual([expect.objectContaining({ name: "Reguler", qty: 2, unitPrice: 100000, lineTotal: 200000 })]);
    expect(view.fields.map((f: { key: string }) => f.key)).toEqual(["kota"]);
    expect(view.paymentMethods[0]).toEqual({ key: "qris", label: "QRIS", group: "qris" });

    const other = await getHold(request(`/api/holds/${holdId}`, { method: "GET", vid: newVisitorCookie().value }), idParams(holdId));
    expect(other.status).toBe(404);
    const anonymous = await getHold(request(`/api/holds/${holdId}`, { method: "GET", vid: null }), idParams(holdId));
    expect(anonymous.status).toBe(401);
  });

  it("delete releases", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const vid = newVisitorCookie().value;
    const { holdId } = await (await hold(vid, ev.eventId, ev.inventoryIds[0], 2)).json();
    const res = await deleteHold(request(`/api/holds/${holdId}`, { method: "DELETE", vid }), idParams(holdId));
    expect(await res.json()).toEqual({ released: true });
    expect((await inventoryRow(ev.inventoryIds[0])).held).toBe(0);
  });

  it("quote on expired hold is 410", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const vid = newVisitorCookie().value;
    const { holdId } = await (await hold(vid, ev.eventId, ev.inventoryIds[0], 2)).json();
    const ok = await quote(request(`/api/holds/${holdId}/quote`, { vid, body: {} }), idParams(holdId));
    expect(await ok.json()).toMatchObject({ subtotal: 200000, discount: 0, fee: 5000, total: 205000, voucherError: null });
    await sql`update holds set expires_at = now() - interval '1 minute' where id = ${holdId}`;
    const res = await quote(request(`/api/holds/${holdId}/quote`, { vid, body: {} }), idParams(holdId));
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe("Waktu habis, slot dilepas");
  });
});
