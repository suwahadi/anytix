import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { parseEngineError } from "@/lib/db-errors";
import { reserveTickets } from "@/lib/hold-service";
import { checkoutHold, cleanupTestEvents, createTestEvent, createTestVoucher } from "./helpers";

afterAll(async () => {
  await cleanupTestEvents();
});

type Quote = {
  items: Array<{ inventory_id: number; qty: number; unit_price: number; line_total: number; name: string }>;
  subtotal: number;
  discount: number;
  fee: number;
  total: number;
  voucher_id: number | null;
  voucher_code: string | null;
  voucher_error: string | null;
};

async function holdFor(eventId: number, items: Array<{ inventoryId: number; qty: number }>, visitorId = randomUUID()) {
  const hold = await reserveTickets({ visitorId, eventId, items, idempotencyKey: randomUUID() });
  return { holdId: hold.id, visitorId };
}

async function quote(holdId: string, visitorId: string, code: string | null = null): Promise<Quote> {
  const [row] = await sql<{ q: Quote }[]>`select quote_hold(${holdId}::uuid, ${visitorId}::uuid, ${code}) as q`;
  return row.q;
}

async function engineCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    return parseEngineError(e)?.code ?? `raw:${(e as Error).message}`;
  }
  return undefined;
}

describe("quote_hold", () => {
  it("quote without voucher", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10, price: 100000 }] });
    const { holdId, visitorId } = await holdFor(ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 2 }]);
    const q = await quote(holdId, visitorId);
    expect(q).toMatchObject({ subtotal: 200000, discount: 0, fee: 5000, total: 205000, voucher_error: null });
    expect(q.items).toEqual([expect.objectContaining({ inventory_id: ev.inventoryIds[0], qty: 2, unit_price: 100000, line_total: 200000 })]);
  });

  it("percent voucher with max_discount", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    await createTestVoucher(ev.eventId, { code: "PERSEN10", type: "percent", value: 10, maxDiscount: 15000 });
    const { holdId, visitorId } = await holdFor(ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 2 }]);
    expect(await quote(holdId, visitorId, "PERSEN10")).toMatchObject({ discount: 15000, total: 190000 });
  });

  it("fixed voucher keeps tickets >= 1000", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    await createTestVoucher(ev.eventId, { code: "BESAR", type: "fixed", value: 250000 });
    const { holdId, visitorId } = await holdFor(ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 2 }]);
    expect(await quote(holdId, visitorId, "BESAR")).toMatchObject({ discount: 199000, total: 6000 });
  });

  it("category-scoped voucher", async () => {
    const ev = await createTestEvent({
      categories: [{ capacity: 10, price: 100000 }, { capacity: 10, price: 50000 }],
    });
    const [a, b] = ev.inventoryIds;
    await createTestVoucher(ev.eventId, { code: "HANYAB", value: 50, ticketCategoryIds: [ev.categoryIds[1]] });
    await createTestVoucher(ev.eventId, { code: "HANYAB3", value: 50, ticketCategoryIds: [ev.categoryIds[1]], minQty: 3 });
    const { holdId, visitorId } = await holdFor(ev.eventId, [{ inventoryId: a, qty: 1 }, { inventoryId: b, qty: 2 }]);
    expect(await quote(holdId, visitorId, "HANYAB")).toMatchObject({ subtotal: 200000, discount: 50000 });
    expect(await quote(holdId, visitorId, "HANYAB3")).toMatchObject({ discount: 0, voucher_error: "MIN_QTY", voucher_id: null });
  });

  it("voucher errors and case-insensitive code", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    await createTestVoucher(ev.eventId, { code: "MATI", active: false });
    await createTestVoucher(ev.eventId, { code: "LEWAT", validTo: new Date(Date.now() - 60_000) });
    await createTestVoucher(ev.eventId, { code: "NANTI", validFrom: new Date(Date.now() + 3_600_000) });
    await createTestVoucher(ev.eventId, { code: "MINIMAL", minSubtotal: 500000 });
    await createTestVoucher(ev.eventId, { code: "HABIS", maxUses: 0 });
    const id = await createTestVoucher(ev.eventId, { code: "HEMAT10" });
    const { holdId, visitorId } = await holdFor(ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 1 }]);
    expect((await quote(holdId, visitorId, "TIDAKADA")).voucher_error).toBe("NOT_FOUND");
    expect((await quote(holdId, visitorId, "MATI")).voucher_error).toBe("INACTIVE");
    expect((await quote(holdId, visitorId, "LEWAT")).voucher_error).toBe("ENDED");
    expect((await quote(holdId, visitorId, "NANTI")).voucher_error).toBe("NOT_STARTED");
    expect((await quote(holdId, visitorId, "MINIMAL")).voucher_error).toBe("MIN_SUBTOTAL");
    expect((await quote(holdId, visitorId, "HABIS")).voucher_error).toBe("EXHAUSTED");
    expect(await quote(holdId, visitorId, "hemat10")).toMatchObject({ voucher_id: id, voucher_error: null, discount: 10000 });
  });

  it("rejects foreign or expired hold", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const { holdId, visitorId } = await holdFor(ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 1 }]);
    expect(await engineCode(quote(holdId, randomUUID()))).toBe("HOLD_NOT_FOUND");
    await sql`update holds set expires_at = now() - interval '1 second' where id = ${holdId}`;
    expect(await engineCode(quote(holdId, visitorId))).toBe("HOLD_EXPIRED");
  });
});

describe("checkout_hold", () => {
  it("checkout creates order, payment, consents, job", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const { holdId, visitorId } = await holdFor(ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 2 }]);
    const order = await checkoutHold(holdId, visitorId, { method: "bca_va" });
    const [o] = await sql`select * from orders where id = ${order.id}`;
    expect(o.status).toBe("awaiting_payment");
    expect(o.invoice_code).toMatch(/^A[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(o).toMatchObject({ subtotal: 200000, fee_amount: 5000, total: 205000, payment_method: "bca_va", voucher_counted: false });
    expect(Math.abs(o.pay_expires_at.getTime() - (Date.now() + 15 * 60_000))).toBeLessThan(10_000);
    const [h] = await sql`select status, expires_at from holds where id = ${holdId}`;
    expect(h.status).toBe("pending_payment");
    expect(Math.abs(h.expires_at.getTime() - (Date.now() + 20 * 60_000))).toBeLessThan(10_000);
    const payments = await sql`select * from payments where order_id = ${order.id}`;
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ attempt: 1, midtrans_order_id: `${o.invoice_code}-1`, status: "pending", gross_amount: 205000 });
    const consents = await sql`select purpose from consents where order_id = ${order.id} order by purpose`;
    expect(consents.map((c) => c.purpose)).toEqual(["privacy", "terms"]);
    const jobs = await sql`select type, status from jobs where dedupe_key = ${`email:awaiting_payment:${order.id}`}`;
    expect(jobs).toEqual([{ type: "email", status: "queued" }]);
  });

  it("checkout is idempotent", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const { holdId, visitorId } = await holdFor(ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 1 }]);
    const [a, b] = await Promise.all([checkoutHold(holdId, visitorId), checkoutHold(holdId, visitorId)]);
    expect(b.id).toBe(a.id);
    expect(await sql`select id from payments where order_id = ${a.id}`).toHaveLength(1);
  });

  it("checkout on expired or foreign hold", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const { holdId, visitorId } = await holdFor(ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 1 }]);
    expect(await engineCode(checkoutHold(holdId, randomUUID()))).toBe("HOLD_NOT_FOUND");
    await sql`update holds set expires_at = now() - interval '1 second' where id = ${holdId}`;
    expect(await engineCode(checkoutHold(holdId, visitorId))).toBe("HOLD_EXPIRED");
  });

  it("rejects invalid voucher at checkout", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const { holdId, visitorId } = await holdFor(ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 1 }]);
    expect(await engineCode(checkoutHold(holdId, visitorId, { voucherCode: "TIDAKADA" }))).toBe("VOUCHER_INVALID");
    const [h] = await sql`select status from holds where id = ${holdId}`;
    expect(h.status).toBe("held");
  });

  it("voucher last use race", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const voucherId = await createTestVoucher(ev.eventId, { code: "SATU", maxUses: 1 });
    const a = await holdFor(ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 1 }]);
    const b = await holdFor(ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 1 }]);
    const results = await Promise.allSettled([
      checkoutHold(a.holdId, a.visitorId, { voucherCode: "SATU" }),
      checkoutHold(b.holdId, b.visitorId, { voucherCode: "SATU" }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.flatMap((r) => (r.status === "rejected" ? [parseEngineError(r.reason)?.code] : []));
    expect(ok).toHaveLength(1);
    expect(failed).toEqual(["VOUCHER_UNAVAILABLE"]);
    const loser = results[0].status === "rejected" ? a : b;
    const [h] = await sql`select status from holds where id = ${loser.holdId}`;
    expect(h.status).toBe("held");
    const [v] = await sql`select held, used from vouchers where id = ${voucherId}`;
    expect(v).toEqual({ held: 1, used: 0 });
  });

  it("identity answer stored encrypted", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const [field] = await sql<{ id: number }[]>`
      insert into form_fields (event_id, key, label, type) values (${ev.eventId}, 'identity', 'Identitas', 'identity')
      returning id`;
    const { holdId, visitorId } = await holdFor(ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 1 }]);
    const enc = encrypt("3201234567890001").toString("base64");
    const order = await checkoutHold(holdId, visitorId, {
      answers: [{ form_field_id: field.id, value: { type: "KTP" }, value_encrypted: enc }],
    });
    const [ans] = await sql<{ value: unknown; value_encrypted: Buffer }[]>`
      select value, value_encrypted from order_answers where order_id = ${order.id}`;
    expect(ans.value).toEqual({ type: "KTP" });
    expect(decrypt(Buffer.from(ans.value_encrypted))).toBe("3201234567890001");
  });
});
