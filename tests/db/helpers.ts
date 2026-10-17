import { randomUUID } from "node:crypto";
import { sql, transaction } from "@/lib/db";

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
  await transaction(async (tx) => {
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

type VoucherFields = Partial<{
  code: string;
  type: "percent" | "fixed";
  value: number;
  maxDiscount: number;
  minQty: number;
  minSubtotal: number;
  ticketCategoryIds: number[];
  maxUses: number;
  active: boolean;
  validFrom: Date;
  validTo: Date;
}>;

export async function createTestVoucher(eventId: number, f: VoucherFields = {}): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    insert into vouchers (event_id, code, type, value, max_discount, min_qty, min_subtotal, ticket_category_ids,
                          max_uses, active, valid_from, valid_to)
    values (${eventId}, ${f.code ?? `V${randomUUID().slice(0, 6).toUpperCase()}`}, ${f.type ?? "percent"},
            ${f.value ?? 10}, ${f.maxDiscount ?? null}, ${f.minQty ?? 0}, ${f.minSubtotal ?? 0},
            ${f.ticketCategoryIds ?? null}, ${f.maxUses ?? null}, ${f.active ?? true},
            ${f.validFrom ?? null}, ${f.validTo ?? null})
    returning id`;
  return row.id;
}

export const testBuyer = { name: "Budi Santoso", email: "budi@example.com", phone: "6281234567890" };

export const testConsents = [
  { policy_version: "2026-10-17", purpose: "terms", ip: "127.0.0.1" },
  { policy_version: "2026-10-17", purpose: "privacy", ip: "127.0.0.1" },
];

export async function checkoutHold(
  holdId: string,
  visitorId: string,
  opts: { voucherCode?: string | null; answers?: unknown[]; method?: string } = {},
) {
  const [order] = await sql<{ id: number; invoice_code: string; status: string }[]>`
    select * from checkout_hold(${holdId}::uuid, ${visitorId}::uuid, ${sql.json(testBuyer)},
                                ${sql.json((opts.answers ?? []) as never)}, ${opts.method ?? "qris"},
                                ${opts.voucherCode ?? null}, ${sql.json(testConsents)})`;
  return order;
}

export async function checkoutTestOrder(opts: {
  eventId: number;
  items: Array<{ inventoryId: number; qty: number }>;
  voucherCode?: string;
  visitorId?: string;
}): Promise<{ holdId: string; orderId: number; midtransOrderId: string; visitorId: string }> {
  const { reserveTickets } = await import("@/lib/hold-service");
  const visitorId = opts.visitorId ?? randomUUID();
  const hold = await reserveTickets({ visitorId, eventId: opts.eventId, items: opts.items, idempotencyKey: randomUUID() });
  const order = await checkoutHold(hold.id, visitorId, { voucherCode: opts.voucherCode });
  const [payment] = await sql<{ midtrans_order_id: string }[]>`
    select midtrans_order_id from payments where order_id = ${order.id}`;
  return { holdId: hold.id, orderId: order.id, midtransOrderId: payment.midtrans_order_id, visitorId };
}
