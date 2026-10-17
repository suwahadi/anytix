import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createSql, sql } from "@/lib/db";
import { parseEngineError } from "@/lib/db-errors";
import { HoldError, releaseHold, reserveTickets } from "@/lib/hold-service";
import { cleanupTestEvents, createTestEvent, inventoryRow } from "./helpers";

afterAll(async () => {
  await cleanupTestEvents();
});

const reserve = (visitorId: string, eventId: number, items: Array<{ inventoryId: number; qty: number }>) =>
  reserveTickets({ visitorId, eventId, items, idempotencyKey: randomUUID() });

async function holdStatus(id: string) {
  const [row] = await sql<{ status: string }[]>`select status from holds where id = ${id}`;
  return row.status;
}

async function countedSum(inv: number) {
  const [row] = await sql<{ s: number }[]>`
    select coalesce(sum(qty), 0)::int8 as s from hold_items where inventory_id = ${inv} and counted`;
  return row.s;
}

async function catchHoldError(p: Promise<unknown>): Promise<HoldError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof HoldError) return e;
    throw e;
  }
  throw new Error("expected HoldError");
}

describe("reserve_tickets", () => {
  it("reserves and counts held", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const hold = await reserve(randomUUID(), ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 2 }]);
    expect(hold.status).toBe("held");
    expect(Math.abs(hold.expiresAt.getTime() - (Date.now() + 3 * 60_000))).toBeLessThan(10_000);
    expect(await inventoryRow(ev.inventoryIds[0])).toMatchObject({ held: 2, sold: 0 });
  });

  it("idempotent replay returns original hold", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const input = {
      visitorId: randomUUID(),
      eventId: ev.eventId,
      items: [{ inventoryId: ev.inventoryIds[0], qty: 2 }],
      idempotencyKey: randomUUID(),
    };
    const a = await reserveTickets(input);
    const b = await reserveTickets(input);
    expect(b.id).toBe(a.id);
    expect((await inventoryRow(ev.inventoryIds[0])).held).toBe(2);
    await sql`update holds set expires_at = now() - interval '1 minute' where id = ${a.id}`;
    const c = await reserveTickets(input);
    expect(c.id).toBe(a.id);
    expect(c.expiresAt.getTime()).toBeLessThan(Date.now());
  });

  it("rejects qty over max_per_order", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10, maxPerOrder: 5 }] });
    const err = await catchHoldError(reserve(randomUUID(), ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 6 }]));
    expect(err.code).toBe("MAX_PER_ORDER");
    expect(err.inventoryId).toBe(ev.inventoryIds[0]);
    expect(err.max).toBe(5);
  });

  it("sold out reports available", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 3 }] });
    const inv = ev.inventoryIds[0];
    await reserve(randomUUID(), ev.eventId, [{ inventoryId: inv, qty: 2 }]);
    const err = await catchHoldError(reserve(randomUUID(), ev.eventId, [{ inventoryId: inv, qty: 2 }]));
    expect(err.code).toBe("SOLD_OUT");
    expect(err.inventoryId).toBe(inv);
    expect(err.available).toBe(1);
    expect((await inventoryRow(inv)).held).toBe(2);
  });

  it("new hold replaces visitor's old held hold", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const visitor = randomUUID();
    const first = await reserve(visitor, ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 2 }]);
    const second = await reserve(visitor, ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 1 }]);
    expect(second.id).not.toBe(first.id);
    expect(await holdStatus(first.id)).toBe("released");
    expect((await inventoryRow(ev.inventoryIds[0])).held).toBe(1);
  });

  it("pending_payment hold untouched by new reserve", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const visitor = randomUUID();
    const first = await reserve(visitor, ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 2 }]);
    await sql`update holds set status = 'pending_payment' where id = ${first.id}`;
    await reserve(visitor, ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 1 }]);
    expect(await holdStatus(first.id)).toBe("pending_payment");
    expect((await inventoryRow(ev.inventoryIds[0])).held).toBe(3);
  });

  it("does not release a hold that checkout is moving to pending_payment", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const inv = ev.inventoryIds[0];
    const visitor = randomUUID();
    const first = await reserve(visitor, ev.eventId, [{ inventoryId: inv, qty: 2 }]);
    const tx = await sql.reserve();
    try {
      await tx`begin`;
      await tx`update holds set status = 'pending_payment', expires_at = now() + interval '20 minutes' where id = ${first.id}`;
      const second = reserve(visitor, ev.eventId, [{ inventoryId: inv, qty: 1 }]).catch((e) => e);
      for (let i = 0; i < 100; i++) {
        const [w] = await sql<{ n: number }[]>`
          select count(*)::int8 as n from pg_stat_activity
          where wait_event_type = 'Lock' and query like '%reserve_tickets%'`;
        if (w.n > 0) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      await tx`commit`;
      await second;
    } finally {
      tx.release();
    }
    expect(await holdStatus(first.id)).toBe("pending_payment");
    const items = await sql`select counted from hold_items where hold_id = ${first.id}`;
    expect(items.map((i) => i.counted)).toEqual([true]);
    expect((await inventoryRow(inv)).held).toBe(3);
    expect(await countedSum(inv)).toBe(3);
  });

  it("lazy reclaim frees expired holds", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 2 }] });
    const inv = ev.inventoryIds[0];
    const a = await reserve(randomUUID(), ev.eventId, [{ inventoryId: inv, qty: 2 }]);
    await sql`update holds set expires_at = now() - interval '1 second' where id = ${a.id}`;
    await reserve(randomUUID(), ev.eventId, [{ inventoryId: inv, qty: 2 }]);
    const [item] = await sql`select counted from hold_items where hold_id = ${a.id}`;
    expect(item.counted).toBe(false);
    expect((await inventoryRow(inv)).held).toBe(2);
    expect(await countedSum(inv)).toBe(2);
  });

  it("not on sale", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    await sql`update event_sessions set status = 'paused' where id = ${ev.sessionId}`;
    const err = await catchHoldError(reserve(randomUUID(), ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 1 }]));
    expect(err.code).toBe("NOT_ON_SALE");
  });

  it("category outside sale window is not on sale", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    await sql`update ticket_categories set sale_starts_at = now() + interval '1 hour', sale_ends_at = now() + interval '2 hours'
              where id = ${ev.categoryIds[0]}`;
    const err = await catchHoldError(reserve(randomUUID(), ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 1 }]));
    expect(err.code).toBe("CATEGORY_NOT_ON_SALE");
  });

  it("rejects items from another event", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const other = await createTestEvent({ categories: [{ capacity: 10 }] });
    const err = await catchHoldError(reserve(randomUUID(), ev.eventId, [{ inventoryId: other.inventoryIds[0], qty: 1 }]));
    expect(err.code).toBe("INVALID_ITEMS");
    const dup = await catchHoldError(
      reserve(randomUUID(), ev.eventId, [
        { inventoryId: ev.inventoryIds[0], qty: 1 },
        { inventoryId: ev.inventoryIds[0], qty: 1 },
      ]),
    );
    expect(dup.code).toBe("INVALID_ITEMS");
  });

  it("release_hold frees slots", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const visitor = randomUUID();
    const hold = await reserve(visitor, ev.eventId, [{ inventoryId: ev.inventoryIds[0], qty: 2 }]);
    expect(await releaseHold(hold.id, randomUUID())).toBe(false);
    expect(await releaseHold(hold.id, visitor)).toBe(true);
    expect(await holdStatus(hold.id)).toBe("released");
    expect((await inventoryRow(ev.inventoryIds[0])).held).toBe(0);
    expect(await releaseHold(hold.id, visitor)).toBe(false);
  });

  it("300 reservers on capacity 100", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 100 }] });
    const inv = ev.inventoryIds[0];
    const db = createSql(50);
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 300 }, () =>
          db`select id from reserve_tickets(${randomUUID()}::uuid, ${ev.eventId}, ${db.json([{ inventory_id: inv, qty: 1 }])}, ${randomUUID()})`,
        ),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const codes = results.flatMap((r) => (r.status === "rejected" ? [parseEngineError(r.reason)?.code ?? String(r.reason)] : []));
      expect(ok).toBe(100);
      expect(codes).toHaveLength(200);
      expect(new Set(codes)).toEqual(new Set(["SOLD_OUT"]));
    } finally {
      await db.end({ timeout: 5 });
    }
    const row = await inventoryRow(inv);
    expect(row.held).toBe(100);
    expect(row.sold + row.held).toBeLessThanOrEqual(row.capacity);
    expect(await countedSum(inv)).toBe(100);
  });

  it("concurrent reserve same visitor", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 50 }] });
    const inv = ev.inventoryIds[0];
    const visitor = randomUUID();
    const results = await Promise.allSettled(
      [1, 2, 3, 4, 5].map((qty) => reserve(visitor, ev.eventId, [{ inventoryId: inv, qty }])),
    );
    for (const r of results) {
      if (r.status === "rejected") {
        expect(r.reason).toBeInstanceOf(HoldError);
        expect(r.reason.code).toBe("CONCURRENT");
      }
    }
    const active = await sql<{ id: string; qty: number }[]>`
      select h.id, sum(hi.qty)::int8 as qty from holds h join hold_items hi on hi.hold_id = h.id
      where h.visitor_id = ${visitor} and h.event_id = ${ev.eventId} and h.status = 'held' group by h.id`;
    expect(active).toHaveLength(1);
    expect((await inventoryRow(inv)).held).toBe(active[0].qty);
    expect(await countedSum(inv)).toBe(active[0].qty);
  });

  it("mixed category order does not deadlock", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 500 }, { capacity: 500 }] });
    const [x, y] = ev.inventoryIds;
    const db = createSql(30);
    const call = (visitor: string, items: Array<{ inventory_id: number; qty: number }>) =>
      db`select id from reserve_tickets(${visitor}::uuid, ${ev.eventId}, ${db.json(items)}, ${randomUUID()})`;
    try {
      const visitors = Array.from({ length: 100 }, () => randomUUID());
      await Promise.all(visitors.map((v, i) => call(v, [{ inventory_id: i % 2 ? x : y, qty: 1 }])));
      const results = await Promise.allSettled(
        visitors.map((v, i) =>
          call(v, i % 2 ? [{ inventory_id: y, qty: 1 }, { inventory_id: x, qty: 1 }] : [{ inventory_id: x, qty: 1 }, { inventory_id: y, qty: 1 }]),
        ),
      );
      const errors = results.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
      expect(errors.map((e) => e.code)).toEqual([]);
    } finally {
      await db.end({ timeout: 5 });
    }
    for (const inv of [x, y]) {
      expect((await inventoryRow(inv)).held).toBe(100);
      expect(await countedSum(inv)).toBe(100);
    }
  });
});
