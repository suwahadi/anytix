import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createSql, sql } from "@/lib/db";
import { reserveTickets } from "@/lib/hold-service";
import { checkoutTestOrder, cleanupTestEvents, createTestEvent, createTestVoucher, inventoryRow } from "./helpers";

afterAll(async () => {
  await cleanupTestEvents();
});

type Drift = { inventory_id: number; held_actual: number; held_expected: number; sold_actual: number; sold_expected: number };

async function drift(ids: number[], fix = false): Promise<Drift[]> {
  const rows = await sql<Drift[]>`select * from reconcile_inventory(${fix})`;
  return rows.filter((r) => ids.includes(r.inventory_id));
}

describe("sweep_expired_holds", () => {
  it("sweeper expires held and pending holds", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const inv = ev.inventoryIds[0];
    const vid = await createTestVoucher(ev.eventId, { code: "SAPU", maxUses: 3 });
    const held = await reserveTickets({ visitorId: randomUUID(), eventId: ev.eventId, items: [{ inventoryId: inv, qty: 1 }], idempotencyKey: randomUUID() });
    const pending = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: inv, qty: 2 }], voucherCode: "SAPU" });
    await sql`update holds set expires_at = now() - interval '1 second' where id in ${sql([held.id, pending.holdId])}`;
    await sql`select sweep_expired_holds()`;
    const statuses = await sql`select id, status from holds where id in ${sql([held.id, pending.holdId])}`;
    expect(statuses.map((s) => s.status)).toEqual(["expired", "expired"]);
    expect(await inventoryRow(inv)).toMatchObject({ held: 0, sold: 0 });
    const [o] = await sql`select status, voucher_counted from orders where id = ${pending.orderId}`;
    expect(o).toEqual({ status: "awaiting_payment", voucher_counted: false });
    expect(await sql`select held from vouchers where id = ${vid}`).toEqual([{ held: 0 }]);
    const jobs = await sql`select type from jobs where dedupe_key = ${`payment-check:${pending.orderId}`}`;
    expect(jobs).toEqual([{ type: "payment-check" }]);
  });

  it("sweeper concurrent with reserves", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 1000 }, { capacity: 1000 }] });
    const [x, y] = ev.inventoryIds;
    const db = createSql(30);
    const call = (items: Array<{ inventory_id: number; qty: number }>) =>
      db`select id from reserve_tickets(${randomUUID()}::uuid, ${ev.eventId}, ${db.json(items)}, ${randomUUID()})`;
    try {
      await Promise.all(Array.from({ length: 50 }, (_, i) => call([{ inventory_id: i % 2 ? x : y, qty: 1 }, ...(i % 3 ? [] : [{ inventory_id: i % 2 ? y : x, qty: 1 }])])));
      await sql`update holds set expires_at = now() - interval '1 second' where event_id = ${ev.eventId}`;
      const results = await Promise.allSettled([
        db`select sweep_expired_holds()`,
        ...Array.from({ length: 100 }, (_, i) =>
          call(i % 2 ? [{ inventory_id: y, qty: 1 }, { inventory_id: x, qty: 1 }] : [{ inventory_id: x, qty: 1 }]),
        ),
        db`select sweep_expired_holds()`,
      ]);
      const errors = results.flatMap((r) => (r.status === "rejected" ? [r.reason.code ?? r.reason.message] : []));
      expect(errors).toEqual([]);
    } finally {
      await db.end({ timeout: 5 });
    }
    await sql`select sweep_expired_holds()`;
    expect(await drift([x, y])).toEqual([]);
    expect((await inventoryRow(x)).held).toBe(100);
    expect((await inventoryRow(y)).held).toBe(50);
  });

  it("reconcile detects and fixes drift", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const inv = ev.inventoryIds[0];
    await reserveTickets({ visitorId: randomUUID(), eventId: ev.eventId, items: [{ inventoryId: inv, qty: 2 }], idempotencyKey: randomUUID() });
    expect(await drift([inv])).toEqual([]);
    await sql`update ticket_inventory set held = held + 1 where id = ${inv}`;
    expect(await drift([inv])).toEqual([{ inventory_id: inv, held_actual: 3, held_expected: 2, sold_actual: 0, sold_expected: 0 }]);
    await drift([inv], true);
    expect(await drift([inv])).toEqual([]);
    expect((await inventoryRow(inv)).held).toBe(2);
  });

  it("cron job scheduled", async () => {
    const [row] = await sql`select schedule, command from cron.job where jobname = 'sweep-expired-holds'`;
    expect(row).toEqual({ schedule: "15 seconds", command: "select public.sweep_expired_holds()" });
  });
});
