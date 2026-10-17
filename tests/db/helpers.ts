import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";

type CategoryInput = {
  name?: string;
  price?: number;
  capacity: number;
  maxPerOrder?: number;
  admitsPerUnit?: number;
};

export type TestEvent = {
  eventId: number;
  sessionId: number;
  inventoryIds: number[];
  categoryIds: number[];
};

export async function createTestEvent(opts: { categories?: CategoryInput[] } = {}): Promise<TestEvent> {
  const categories = opts.categories ?? [{ capacity: 10 }];
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const [{ id: eventCategoryId }] = await sql<{ id: number }[]>`
    select id from event_categories order by position limit 1`;
  const [event] = await sql<{ id: number }[]>`
    insert into events (event_category_id, title, slug, starts_at, ends_at, status, sale_status)
    values (${eventCategoryId}, ${"Test " + slug}, ${slug}, now() + interval '7 days', now() + interval '8 days',
            'published', 'on_sale')
    returning id`;
  const [session] = await sql<{ id: number }[]>`
    insert into event_sessions (event_id, starts_at, ends_at, status)
    values (${event.id}, now() + interval '7 days', now() + interval '8 days', 'on_sale')
    returning id`;
  const categoryIds: number[] = [];
  const inventoryIds: number[] = [];
  for (const [i, c] of categories.entries()) {
    const [cat] = await sql<{ id: number }[]>`
      insert into ticket_categories (event_id, name, price, max_per_order, admits_per_unit,
                                     sale_starts_at, sale_ends_at, status, position)
      values (${event.id}, ${c.name ?? `Kategori ${i + 1}`}, ${c.price ?? 100000}, ${c.maxPerOrder ?? 5},
              ${c.admitsPerUnit ?? 1}, now() - interval '1 hour', now() + interval '1 day', 'active', ${i + 1})
      returning id`;
    const [inv] = await sql<{ id: number }[]>`
      insert into ticket_inventory (session_id, ticket_category_id, capacity)
      values (${session.id}, ${cat.id}, ${c.capacity})
      returning id`;
    categoryIds.push(cat.id);
    inventoryIds.push(inv.id);
  }
  return { eventId: event.id, sessionId: session.id, inventoryIds, categoryIds };
}

export async function inventoryRow(id: number): Promise<{ capacity: number; sold: number; held: number }> {
  const [row] = await sql<{ capacity: number; sold: number; held: number }[]>`
    select capacity, sold, held from ticket_inventory where id = ${id}`;
  return row;
}

export async function cleanupTestEvents(): Promise<void> {
  await sql.begin(async (tx) => {
    const events = await tx<{ id: number }[]>`select id from events where slug like 'test-%'`;
    const ids = events.map((e) => e.id);
    if (ids.length === 0) return;
    const orders = await tx<{ id: number }[]>`select id from orders where event_id = any(${ids})`;
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length > 0) {
      await tx`delete from checkin_events where ticket_id in (select id from tickets where order_id = any(${orderIds}))`;
      await tx`delete from tickets where order_id = any(${orderIds})`;
      await tx`delete from payment_events where midtrans_order_id in
                 (select midtrans_order_id from payments where order_id = any(${orderIds}))`;
      await tx`delete from payments where order_id = any(${orderIds})`;
      await tx`delete from order_answers where order_id = any(${orderIds})`;
      await tx`delete from consents where order_id = any(${orderIds})`;
      await tx`delete from email_logs where order_id = any(${orderIds})`;
      await tx`delete from jobs where (payload->>'order_id')::bigint = any(${orderIds})`;
      await tx`delete from orders where id = any(${orderIds})`;
    }
    await tx`delete from hold_items where hold_id in (select id from holds where event_id = any(${ids}))`;
    await tx`delete from holds where event_id = any(${ids})`;
    await tx`delete from vouchers where event_id = any(${ids})`;
    await tx`delete from ticket_inventory where session_id in (select id from event_sessions where event_id = any(${ids}))`;
    await tx`delete from ticket_categories where event_id = any(${ids})`;
    await tx`delete from event_sessions where event_id = any(${ids})`;
    await tx`delete from form_fields where event_id = any(${ids})`;
    await tx`delete from slug_redirects where event_id = any(${ids})`;
    await tx`delete from events where id = any(${ids})`;
  });
}
