import { sql } from "@/lib/db";
import type { OrderEmailData } from "@/lib/email/render-order-email";
import { getEnv } from "@/lib/env";
import { getSettingsGroup } from "@/lib/settings-service";
import { PAYMENT_METHODS } from "@/lib/validation/settings";

export async function loadOrderEmailData(orderId: number): Promise<OrderEmailData | null> {
  const [o] = await sql<
    {
      invoice_code: string;
      public_uuid: string;
      buyer_name: string;
      buyer_email: string;
      total: number;
      pay_expires_at: Date;
      payment_method: string;
      hold_id: string;
      title: string;
      slug: string;
      starts_at: Date;
      ends_at: Date;
      timezone: string;
      venue: string | null;
      city: string | null;
      refund_policy: string;
    }[]
  >`
    select o.invoice_code, o.public_uuid, o.buyer_name, o.buyer_email, o.total, o.pay_expires_at, o.payment_method, o.hold_id,
           e.title, e.slug, e.starts_at, e.ends_at, e.timezone, e.venue, e.city, e.refund_policy
      from orders o join events e on e.id = o.event_id
     where o.id = ${orderId}`;
  if (!o) return null;
  const [items, site] = await Promise.all([
    sql<{ name: string; qty: number; lineTotal: number }[]>`
      select c.name, hi.qty, hi.qty * hi.unit_price as "lineTotal"
        from hold_items hi
        join ticket_inventory i on i.id = hi.inventory_id
        join ticket_categories c on c.id = i.ticket_category_id
       where hi.hold_id = ${o.hold_id}
       order by c.position, c.id`,
    getSettingsGroup("site"),
  ]);
  return {
    invoice: o.invoice_code,
    publicUuid: o.public_uuid,
    buyerName: o.buyer_name,
    buyerEmail: o.buyer_email,
    total: Number(o.total),
    payExpiresAt: o.pay_expires_at,
    paymentMethodLabel: PAYMENT_METHODS.find((m) => m.key === o.payment_method)?.label ?? o.payment_method,
    items: items.map((i) => ({ ...i, lineTotal: Number(i.lineTotal) })),
    event: {
      title: o.title,
      slug: o.slug,
      startsAt: o.starts_at,
      endsAt: o.ends_at,
      timezone: o.timezone,
      venue: o.venue ?? "",
      city: o.city ?? "",
      refundPolicy: o.refund_policy,
    },
    site: { name: site.name, csWhatsapp: site.csWhatsapp, csEmail: site.csEmail },
    appUrl: getEnv().APP_URL,
  };
}
