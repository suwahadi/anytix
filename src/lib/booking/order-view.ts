import { displayStatus, type DisplayStatus } from "@/lib/booking/order-status";
import { sql } from "@/lib/db";
import { PAYMENT_METHODS } from "@/lib/validation/settings";

export type OrderView = {
  uuid: string;
  invoice: string;
  status: string;
  displayStatus: DisplayStatus;
  payExpiresAt: string;
  serverNow: string;
  paymentMethod: { key: string; label: string };
  buyerName: string;
  items: Array<{ name: string; qty: number; lineTotal: number }>;
  subtotal: number;
  discount: number;
  fee: number;
  total: number;
  event: { slug: string; title: string; startsAt: string; endsAt: string; timezone: string; venue: string; city: string };
  hasSnapToken: boolean;
  tickets: Array<{ seq: number; categoryName: string }>;
};

export const ORDER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Buyer-facing order: the UUID is the only key, so it never carries email, phone, answers or identity data. */
export async function getOrderView(uuid: string): Promise<OrderView | null> {
  if (!ORDER_UUID.test(uuid)) return null;
  const [o] = await sql<
    {
      id: number;
      hold_id: string;
      invoice_code: string;
      status: string;
      pay_expires_at: Date;
      server_now: Date;
      payment_method: string;
      buyer_name: string;
      subtotal: number;
      discount_amount: number;
      fee_amount: number;
      total: number;
      slug: string;
      title: string;
      starts_at: Date;
      ends_at: Date;
      timezone: string;
      venue: string | null;
      city: string | null;
      has_snap_token: boolean;
    }[]
  >`
    select o.id, o.hold_id, o.invoice_code, o.status, o.pay_expires_at, now() as server_now, o.payment_method, o.buyer_name,
           o.subtotal, o.discount_amount, o.fee_amount, o.total,
           e.slug, e.title, e.starts_at, e.ends_at, e.timezone, e.venue, e.city,
           exists (select 1 from payments p where p.order_id = o.id and p.snap_token is not null) as has_snap_token
      from orders o join events e on e.id = o.event_id
     where o.public_uuid = ${uuid}`;
  if (!o) return null;
  const [items, tickets] = await Promise.all([
    sql<{ name: string; qty: number; lineTotal: number }[]>`
      select c.name, hi.qty, hi.qty * hi.unit_price as "lineTotal"
        from hold_items hi
        join ticket_inventory i on i.id = hi.inventory_id
        join ticket_categories c on c.id = i.ticket_category_id
       where hi.hold_id = ${o.hold_id}
       order by c.position, c.id`,
    o.status === "paid"
      ? sql<{ seq: number; categoryName: string }[]>`
          select t.seq, c.name as "categoryName" from tickets t join ticket_categories c on c.id = t.ticket_category_id
           where t.order_id = ${o.id} and t.status = 'valid' order by t.seq`
      : Promise.resolve([]),
  ]);
  const method = PAYMENT_METHODS.find((m) => m.key === o.payment_method);
  return {
    uuid,
    invoice: o.invoice_code,
    status: o.status,
    displayStatus: displayStatus(o.status, o.pay_expires_at, o.server_now),
    payExpiresAt: o.pay_expires_at.toISOString(),
    serverNow: o.server_now.toISOString(),
    paymentMethod: { key: o.payment_method, label: method ? (method.key === "qris" ? "QRIS" : `Virtual Account ${method.label}`) : o.payment_method },
    buyerName: o.buyer_name,
    items: items.map((i) => ({ ...i, lineTotal: Number(i.lineTotal) })),
    subtotal: Number(o.subtotal),
    discount: Number(o.discount_amount),
    fee: Number(o.fee_amount),
    total: Number(o.total),
    event: {
      slug: o.slug,
      title: o.title,
      startsAt: o.starts_at.toISOString(),
      endsAt: o.ends_at.toISOString(),
      timezone: o.timezone,
      venue: o.venue ?? "",
      city: o.city ?? "",
    },
    hasSnapToken: o.has_snap_token,
    tickets: tickets.map((t) => ({ seq: t.seq, categoryName: t.categoryName })),
  };
}
