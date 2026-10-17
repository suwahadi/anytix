import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "@/lib/db";
import { parseEngineError } from "@/lib/db-errors";
import { checkoutTestOrder, cleanupTestEvents, createTestEvent, createTestVoucher, inventoryRow } from "./helpers";

afterAll(async () => {
  await cleanupTestEvents();
});

type Applied = { found: boolean; order_id?: number; public_uuid?: string; status?: string; changed?: boolean };

async function apply(midtransOrderId: string, status: string, payload: object = {}): Promise<Applied> {
  const [row] = await sql<{ r: Applied }[]>`
    select apply_payment_status(${midtransOrderId}, ${status}, ${sql.json({ transaction_id: randomUUID(), ...payload })}) as r`;
  return row.r;
}

async function order(id: number) {
  const [row] = await sql`select * from orders where id = ${id}`;
  return row;
}

async function holdStatus(id: string) {
  const [row] = await sql<{ status: string }[]>`select status from holds where id = ${id}`;
  return row.status;
}

async function jobKeys(orderId: number) {
  const rows = await sql<{ dedupe_key: string }[]>`
    select dedupe_key from jobs where (payload->>'order_id')::bigint = ${orderId} order by dedupe_key`;
  return rows.map((r) => r.dedupe_key);
}

async function expireAndSweep(holdId: string) {
  await sql`update holds set expires_at = now() - interval '1 second' where id = ${holdId}`;
  await sql`select sweep_expired_holds()`;
}

async function countedSum(inv: number) {
  const [row] = await sql<{ s: number }[]>`
    select coalesce(sum(qty), 0)::int8 as s from hold_items where inventory_id = ${inv} and counted`;
  return row.s;
}

describe("apply_payment_status", () => {
  it("settlement moves held to sold and issues tickets", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10, admitsPerUnit: 2 }, { capacity: 10 }] });
    const [bundle, regular] = ev.inventoryIds;
    const o = await checkoutTestOrder({
      eventId: ev.eventId,
      items: [{ inventoryId: bundle, qty: 1 }, { inventoryId: regular, qty: 2 }],
    });
    const r = await apply(o.midtransOrderId, "settlement");
    expect(r).toMatchObject({ found: true, order_id: o.orderId, status: "paid", changed: true });
    const row = await order(o.orderId);
    expect(row.status).toBe("paid");
    expect(row.paid_at).not.toBeNull();
    expect(await holdStatus(o.holdId)).toBe("paid");
    expect(await inventoryRow(bundle)).toMatchObject({ sold: 1, held: 0 });
    expect(await inventoryRow(regular)).toMatchObject({ sold: 2, held: 0 });
    const tickets = await sql<{ seq: number; token: string }[]>`
      select seq, token from tickets where order_id = ${o.orderId} order by seq`;
    expect(tickets.map((t) => t.seq)).toEqual([1, 2, 3, 4]);
    for (const t of tickets) expect(t.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(new Set(tickets.map((t) => t.token)).size).toBe(4);
    expect(await jobKeys(o.orderId)).toContain(`email:paid:${o.orderId}`);
  });

  it("duplicate settlement is a no-op", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const o = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 2 }] });
    await apply(o.midtransOrderId, "settlement");
    const again = await apply(o.midtransOrderId, "settlement");
    expect(again).toMatchObject({ found: true, changed: false, status: "paid" });
    expect(await sql`select id from tickets where order_id = ${o.orderId}`).toHaveLength(2);
    expect(await inventoryRow(ev.inventoryIds[0])).toMatchObject({ sold: 2, held: 0 });
  });

  it("expire releases slots", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const o = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 2 }] });
    const r = await apply(o.midtransOrderId, "expire");
    expect(r).toMatchObject({ status: "expired", changed: true });
    expect(await holdStatus(o.holdId)).toBe("released");
    expect(await inventoryRow(ev.inventoryIds[0])).toMatchObject({ sold: 0, held: 0 });
    expect(await jobKeys(o.orderId)).toContain(`email:expired:${o.orderId}`);
  });

  it("cancel marks order cancelled without expiry email", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const o = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }] });
    expect(await apply(o.midtransOrderId, "cancel")).toMatchObject({ status: "cancelled" });
    expect((await inventoryRow(ev.inventoryIds[0])).held).toBe(0);
    expect(await jobKeys(o.orderId)).not.toContain(`email:expired:${o.orderId}`);
  });

  it("expire after settlement is a no-op", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const o = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }] });
    await apply(o.midtransOrderId, "settlement");
    expect(await apply(o.midtransOrderId, "expire")).toMatchObject({ status: "paid", changed: false });
    expect(await inventoryRow(ev.inventoryIds[0])).toMatchObject({ sold: 1, held: 0 });
  });

  it("late settlement with quota honored", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const inv = ev.inventoryIds[0];
    const o = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: inv, qty: 2 }] });
    await expireAndSweep(o.holdId);
    expect(await inventoryRow(inv)).toMatchObject({ held: 0, sold: 0 });
    expect(await apply(o.midtransOrderId, "settlement")).toMatchObject({ status: "paid", changed: true });
    expect(await inventoryRow(inv)).toMatchObject({ held: 0, sold: 2 });
    expect(await holdStatus(o.holdId)).toBe("paid");
  });

  it("late settlement without quota goes to review", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 1 }] });
    const inv = ev.inventoryIds[0];
    const a = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: inv, qty: 1 }] });
    await expireAndSweep(a.holdId);
    const b = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: inv, qty: 1 }] });
    await apply(b.midtransOrderId, "settlement");
    expect(await apply(a.midtransOrderId, "settlement")).toMatchObject({ status: "late_paid_review", changed: true });
    expect(await inventoryRow(inv)).toMatchObject({ sold: 1, held: 0 });
    const keys = await jobKeys(a.orderId);
    expect(keys).toContain(`email:late_paid:${a.orderId}`);
    expect(keys).toContain(`admin-alert:late_paid:${a.orderId}`);
    expect(await sql`select id from tickets where order_id = ${a.orderId}`).toHaveLength(0);
  });

  it("late settlement partial reclaim", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 1 }, { capacity: 1 }] });
    const [x, y] = ev.inventoryIds;
    const a = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: x, qty: 1 }, { inventoryId: y, qty: 1 }] });
    await sql`update holds set expires_at = now() - interval '1 second' where id = ${a.holdId}`;
    await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: x, qty: 1 }] });
    expect(await apply(a.midtransOrderId, "settlement")).toMatchObject({ status: "late_paid_review" });
    expect(await inventoryRow(x)).toMatchObject({ sold: 0, held: 1 });
    expect(await inventoryRow(y)).toMatchObject({ sold: 0, held: 0 });
    for (const inv of [x, y]) expect(await countedSum(inv)).toBe((await inventoryRow(inv)).held);
  });

  it("voucher confirmed on settlement", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const vid = await createTestVoucher(ev.eventId, { code: "LUNAS", maxUses: 5 });
    const o = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }], voucherCode: "LUNAS" });
    expect(await sql`select held, used from vouchers where id = ${vid}`).toEqual([{ held: 1, used: 0 }]);
    await apply(o.midtransOrderId, "settlement");
    expect(await sql`select held, used from vouchers where id = ${vid}`).toEqual([{ held: 0, used: 1 }]);
    expect((await order(o.orderId)).voucher_counted).toBe(false);
  });

  it("voucher released on expire", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const vid = await createTestVoucher(ev.eventId, { code: "BATAL", maxUses: 5 });
    const o = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }], voucherCode: "BATAL" });
    await apply(o.midtransOrderId, "expire");
    expect(await sql`select held, used from vouchers where id = ${vid}`).toEqual([{ held: 0, used: 0 }]);
  });

  it("late payment honors voucher beyond max_uses", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const vid = await createTestVoucher(ev.eventId, { code: "TERAKHIR", maxUses: 1 });
    const a = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }], voucherCode: "TERAKHIR" });
    await expireAndSweep(a.holdId);
    expect(await sql`select held, used from vouchers where id = ${vid}`).toEqual([{ held: 0, used: 0 }]);
    const b = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }], voucherCode: "TERAKHIR" });
    await apply(b.midtransOrderId, "settlement");
    expect(await apply(a.midtransOrderId, "settlement")).toMatchObject({ status: "paid" });
    expect(await sql`select held, used from vouchers where id = ${vid}`).toEqual([{ held: 0, used: 2 }]);
  });

  it("issue_late_order needs capacity", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 1 }] });
    const inv = ev.inventoryIds[0];
    const a = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: inv, qty: 1 }] });
    await expireAndSweep(a.holdId);
    const b = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: inv, qty: 1 }] });
    await apply(b.midtransOrderId, "settlement");
    await apply(a.midtransOrderId, "settlement");
    const issue = () => sql`select status from issue_late_order(${a.orderId})`;
    await expect(issue()).rejects.toSatisfy((e) => parseEngineError(e)?.code === "SOLD_OUT");
    await sql`update ticket_inventory set capacity = capacity + 1 where id = ${inv}`;
    expect((await issue())[0].status).toBe("paid");
    expect(await sql`select id from tickets where order_id = ${a.orderId}`).toHaveLength(1);
    expect(await inventoryRow(inv)).toMatchObject({ capacity: 2, sold: 2, held: 0 });
    expect(await jobKeys(a.orderId)).toContain(`email:paid:${a.orderId}`);
    await expect(issue()).rejects.toSatisfy((e) => parseEngineError(e)?.code === "INVALID_STATE");
  });

  it("unknown order", async () => {
    expect(await apply("NOPE-1", "settlement")).toEqual({ found: false });
  });

  it("records each notification once", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const o = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }] });
    await apply(o.midtransOrderId, "pending", { transaction_id: "T1" });
    await apply(o.midtransOrderId, "pending", { transaction_id: "T1" });
    const events = await sql`select id from payment_events where midtrans_order_id = ${o.midtransOrderId}`;
    expect(events).toHaveLength(1);
    const [p] = await sql`select status from payments where midtrans_order_id = ${o.midtransOrderId}`;
    expect(p.status).toBe("pending");
    expect((await order(o.orderId)).status).toBe("awaiting_payment");
  });

  it("functions not executable by anon", async () => {
    const sigs = [
      "public.reserve_tickets(uuid, bigint, jsonb, text)",
      "public.checkout_hold(uuid, uuid, jsonb, jsonb, text, text, jsonb)",
      "public.apply_payment_status(text, text, jsonb)",
      "public.sweep_expired_holds()",
      "public.issue_late_order(bigint)",
      "public.reconcile_inventory(boolean)",
    ];
    for (const sig of sigs) {
      const [row] = await sql`select has_function_privilege('anon', ${sig}, 'execute') as a,
                                      has_function_privilege('authenticated', ${sig}, 'execute') as b`;
      expect([sig, row.a, row.b]).toEqual([sig, false, false]);
    }
  });
});
