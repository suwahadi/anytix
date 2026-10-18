import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as scanRoute } from "@/app/api/admin/check-ins/route";
import { ADMIN_COOKIE, createSessionValue } from "@/lib/admin-session";
import { reissueTickets } from "@/lib/admin/order-admin-service";
import { createAdmin } from "@/lib/admin-service";
import { checkIn, checkinHistory, checkinStats } from "@/lib/checkin/checkin-service";
import { encrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { applyPaymentStatus } from "@/lib/payments/payment-service";
import { checkoutTestOrder, cleanupTestEvents, createTestEvent } from "./helpers";

let adminId = 0;

beforeAll(async () => {
  adminId = await createAdmin(`test-admin-${randomUUID().slice(0, 8)}@example.com`, "rahasia-panjang-123");
});

afterAll(async () => {
  await cleanupTestEvents();
  await sql`delete from audit_logs where admin_id = ${adminId}`;
  await sql`delete from admins where id = ${adminId}`;
});

async function paidOrder(eventId: number, inventoryId: number, qty = 1) {
  const o = await checkoutTestOrder({ eventId, items: [{ inventoryId, qty }] });
  await applyPaymentStatus(o.midtransOrderId, "settlement", { transaction_id: randomUUID() });
  const tickets = await sql<{ token: string }[]>`select token from tickets where order_id = ${o.orderId} order by seq`;
  return { ...o, tokens: tickets.map((t) => t.token) };
}

async function setup(qty = 2) {
  const ev = await createTestEvent({ categories: [{ name: "Reguler", capacity: 20 }] });
  return { ev, ...(await paidOrder(ev.eventId, ev.inventoryIds[0], qty)) };
}

const scan = (token: string, eventId: number, gate = "A") => checkIn(adminId, { token, eventId, gate });

describe("check-in", () => {
  it("first scan is valid with details", async () => {
    const { ev, tokens } = await setup(2);
    expect(await scan(tokens[1], ev.eventId)).toEqual({
      result: "valid",
      buyerName: "Budi Santoso",
      category: "Reguler",
      seq: 2,
      total: 2,
      identity: null,
    });
  });

  it("second scan is used with time and gate", async () => {
    const { ev, tokens } = await setup(1);
    await scan(tokens[0], ev.eventId, "B");
    const again = await scan(tokens[0], ev.eventId, "C");
    expect(again).toMatchObject({ result: "used", gate: "B" });
    expect(Date.now() - new Date((again as { checkedInAt: string }).checkedInAt).getTime()).toBeLessThan(60_000);
  });

  it("parallel scans of one ticket give one valid", async () => {
    const { ev, tokens } = await setup(1);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => scan(tokens[0], ev.eventId, `G${i}`)));
    expect(results.filter((r) => r.result === "valid")).toHaveLength(1);
    expect(results.filter((r) => r.result === "used")).toHaveLength(19);
  });

  it("wrong event is rejected", async () => {
    const { tokens } = await setup(1);
    const other = await createTestEvent();
    const [{ title }] = await sql<{ title: string }[]>`select title from events where id = (select event_id from orders where id = (select order_id from tickets where token = ${tokens[0]}))`;
    expect(await scan(tokens[0], other.eventId)).toEqual({ result: "wrong_event", eventTitle: title });
  });

  it("old token after reissue is invalid", async () => {
    const { ev, orderId, tokens } = await setup(1);
    await reissueTickets(adminId, orderId);
    expect(await scan(tokens[0], ev.eventId)).toEqual({ result: "invalid" });
  });

  it("scan racing a reissue of its token is invalid", async () => {
    const { ev, tokens } = await setup(1);
    const [{ id }] = await sql<{ id: number }[]>`select id from tickets where token = ${tokens[0]}`;
    const tx = await sql.reserve();
    try {
      await tx`begin`;
      await tx`select 1 from tickets where id = ${id} for update`;
      const pending = scan(tokens[0], ev.eventId);
      await new Promise((r) => setTimeout(r, 400));
      await tx`update tickets set token = ${`R${randomUUID().replace(/-/g, "").slice(0, 21)}`} where id = ${id}`;
      await tx`commit`;
      expect(await pending).toEqual({ result: "invalid" });
    } finally {
      tx.release();
    }
    const [t] = await sql<{ checked_in_at: Date | null }[]>`select checked_in_at from tickets where id = ${id}`;
    expect(t.checked_in_at).toBeNull();
  });

  it("garbage token is invalid", async () => {
    const ev = await createTestEvent();
    expect(await scan("https://example.com/not-a-ticket?x=1", ev.eventId)).toEqual({ result: "invalid" });
    expect(await scan("  ab cd  ", ev.eventId)).toEqual({ result: "invalid" });
  });

  it("long non-ticket QR is invalid through the API", async () => {
    const ev = await createTestEvent();
    const qris = `00020101021226670016COM.NOBUBANK.WWW01189360050300000879140214${"8".repeat(120)}5204581253033605802ID6304ABCD`;
    const res = await scanRoute(
      new NextRequest("http://localhost/api/admin/check-ins", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: `${ADMIN_COOKIE}=${createSessionValue(adminId)}` },
        body: JSON.stringify({ token: qris, eventId: ev.eventId, gate: "A" }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "invalid" });
    const rows = await sql<{ result: string; token: string }[]>`select result, token from checkin_events where event_id = ${ev.eventId}`;
    expect(rows).toEqual([{ result: "invalid", token: qris.slice(0, 64) }]);
  });

  it("unpaid order ticket is invalid", async () => {
    const { ev, orderId, tokens } = await setup(1);
    await sql`update orders set status = 'refunded' where id = ${orderId}`;
    expect(await scan(tokens[0], ev.eventId)).toEqual({ result: "invalid" });
  });

  it("masked identity on valid scan", async () => {
    const { ev, orderId, tokens } = await setup(1);
    const [field] = await sql<{ id: number }[]>`
      insert into form_fields (event_id, key, label, type, required, position) values (${ev.eventId}, 'identitas', 'Identitas', 'identity', true, 1) returning id`;
    await sql`insert into order_answers (order_id, form_field_id, value, value_encrypted)
              values (${orderId}, ${field.id}, ${sql.json({ type: "KTP" })}, ${encrypt("3201234567890001")})`;
    expect(await scan(tokens[0], ev.eventId)).toMatchObject({ result: "valid", identity: "KTP 3201********0001" });
  });

  it("every scan writes a checkin event", async () => {
    const { ev, tokens } = await setup(1);
    await scan(tokens[0], ev.eventId, "A");
    await scan(tokens[0], ev.eventId, "A");
    await scan("nope", ev.eventId, "B");
    const rows = await sql<{ result: string; gate: string; admin_id: number }[]>`
      select result, gate, admin_id from checkin_events where event_id = ${ev.eventId} order by id`;
    expect(rows).toEqual([
      { result: "valid", gate: "A", admin_id: adminId },
      { result: "used", gate: "A", admin_id: adminId },
      { result: "invalid", gate: "B", admin_id: adminId },
    ]);
    const history = await checkinHistory(ev.eventId, { page: 1 });
    expect(history.total).toBe(3);
    expect(history.items[0]).toMatchObject({ result: "invalid", gate: "B", buyerName: null });
    expect(history.items[2]).toMatchObject({ result: "valid", seq: 1, category: "Reguler", buyerName: "Budi Santoso" });
    expect((await checkinHistory(ev.eventId, { result: "used", page: 1 })).total).toBe(1);
  });

  it("1000 scans simulation", { timeout: 240_000 }, async () => {
    const ev = await createTestEvent({
      categories: [
        { name: "Reguler", capacity: 100, maxPerOrder: 50, admitsPerUnit: 10 },
        { name: "VIP", capacity: 100, maxPerOrder: 50, admitsPerUnit: 10 },
      ],
    });
    const a = await paidOrder(ev.eventId, ev.inventoryIds[0], 50);
    const b = await paidOrder(ev.eventId, ev.inventoryIds[1], 50);
    const tokens = [...a.tokens, ...b.tokens];
    expect(tokens).toHaveLength(1000);
    const first = await Promise.all(tokens.map((t, i) => scan(t, ev.eventId, i % 2 ? "A" : "B")));
    const repeats = await Promise.all(tokens.slice(0, 200).map((t) => scan(t, ev.eventId, "C")));
    expect(first.filter((r) => r.result === "valid")).toHaveLength(1000);
    expect(repeats.filter((r) => r.result === "used")).toHaveLength(200);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from checkin_events where event_id = ${ev.eventId}`;
    expect(n).toBe(1200);
    expect(await checkinStats(ev.eventId)).toEqual([
      { category: "Reguler", issued: 500, checkedIn: 500 },
      { category: "VIP", issued: 500, checkedIn: 500 },
    ]);
  });
});
