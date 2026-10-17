import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { GET as getOrder } from "@/app/api/orders/[uuid]/route";
import { GET as getPdf } from "@/app/api/orders/[uuid]/tickets.pdf/route";
import { sql } from "@/lib/db";
import { applyPaymentStatus } from "@/lib/payments/payment-service";
import { checkoutTestOrder, cleanupTestEvents, createTestEvent } from "./helpers";

afterAll(async () => {
  await cleanupTestEvents();
});

function get(uuid: string, ip = "10.0.0.9") {
  return getOrder(new NextRequest(`http://localhost/api/orders/${uuid}`, { headers: { "x-forwarded-for": ip } }), { params: Promise.resolve({ uuid }) });
}

function pdf(uuid: string) {
  return getPdf(new NextRequest(`http://localhost/api/orders/${uuid}/tickets.pdf`, { headers: { "x-forwarded-for": "10.0.0.10" } }), {
    params: Promise.resolve({ uuid }),
  });
}

async function uuidOf(orderId: number) {
  const [o] = await sql<{ public_uuid: string }[]>`select public_uuid from orders where id = ${orderId}`;
  return o.public_uuid;
}

describe("orders API", () => {
  it("pending order view has no personal data", async () => {
    const ev = await createTestEvent({ categories: [{ name: "Reguler", capacity: 10 }] });
    const o = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 2 }] });
    const res = await get(await uuidOf(o.orderId));
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view).toMatchObject({ status: "awaiting_payment", displayStatus: "PENDING", total: 205000, fee: 5000, buyerName: "Budi Santoso" });
    expect(view.items).toEqual([{ name: "Reguler", qty: 2, lineTotal: 200000 }]);
    expect(view.tickets).toEqual([]);
    const json = JSON.stringify(view);
    expect(json).not.toContain("budi@example.com");
    expect(json).not.toContain("6281234567890");
    expect(view).not.toHaveProperty("answers");
  });

  it("paid order lists tickets", async () => {
    const ev = await createTestEvent({ categories: [{ name: "Bundling Couple", capacity: 10, admitsPerUnit: 2 }] });
    const o = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }] });
    await applyPaymentStatus(o.midtransOrderId, "settlement", { transaction_id: randomUUID() });
    const view = await (await get(await uuidOf(o.orderId))).json();
    expect(view.displayStatus).toBe("LUNAS");
    expect(view.tickets).toMatchObject([
      { seq: 1, categoryName: "Bundling Couple" },
      { seq: 2, categoryName: "Bundling Couple" },
    ]);
  });

  it("paid order view carries tokens", async () => {
    const ev = await createTestEvent({ categories: [{ name: "Reguler", capacity: 10 }] });
    const o = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 2 }] });
    await applyPaymentStatus(o.midtransOrderId, "settlement", { transaction_id: randomUUID() });
    const view = await (await get(await uuidOf(o.orderId))).json();
    expect(view.tickets).toHaveLength(2);
    for (const t of view.tickets) {
      expect(t.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(t.qr).toMatch(/^data:image\/svg\+xml,/);
      expect(t.checkedInAt).toBeNull();
    }
  });

  it("pending order view has no tokens", async () => {
    const ev = await createTestEvent();
    const o = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }] });
    const view = await (await get(await uuidOf(o.orderId))).json();
    expect(view.tickets).toEqual([]);
  });

  it("pdf for paid order", async () => {
    const ev = await createTestEvent({ categories: [{ name: "Reguler", capacity: 10 }] });
    const o = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 2 }] });
    await applyPaymentStatus(o.midtransOrderId, "settlement", { transaction_id: randomUUID() });
    const uuid = await uuidOf(o.orderId);
    const res = await pdf(uuid);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const [{ invoice_code }] = await sql<{ invoice_code: string }[]>`select invoice_code from orders where id = ${o.orderId}`;
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="e-ticket-${invoice_code}.pdf"`);
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("pdf for unpaid order is 404", async () => {
    const ev = await createTestEvent();
    const o = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }] });
    expect((await pdf(await uuidOf(o.orderId))).status).toBe(404);
  });

  it("unknown or malformed uuid is 404", async () => {
    expect((await get(randomUUID())).status).toBe(404);
    expect((await get("not-a-uuid")).status).toBe(404);
  });

  it("headers are no-store and no-referrer", async () => {
    const res = await get(randomUUID());
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("rate limited after 60 requests a minute from one address", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) statuses.push((await get(randomUUID(), "10.0.0.77")).status);
    expect(statuses[59]).toBe(404);
    expect(statuses[60]).toBe(429);
  });
});
