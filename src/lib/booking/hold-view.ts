import { UserError } from "@/lib/admin-route";
import { sql } from "@/lib/db";
import { parseEngineError } from "@/lib/db-errors";
import type { FormFieldDef } from "@/lib/form-schema";
import { getTransactionSettings } from "@/lib/settings";
import { PAYMENT_METHODS } from "@/lib/validation/settings";

export type HoldStatus = "held" | "pending_payment" | "paid" | "released" | "expired";

export type PaymentMethodOption = { key: string; label: string; group: "qris" | "va" };

export type HoldView = {
  id: string;
  status: HoldStatus;
  expiresAt: string;
  serverNow: string;
  orderUuid: string | null;
  event: { id: number; slug: string; title: string; startsAt: string; endsAt: string; timezone: string; venue: string; city: string; posterPath: string | null };
  items: Array<{ inventoryId: number; name: string; qty: number; unitPrice: number; lineTotal: number; admitsPerUnit: number }>;
  fields: FormFieldDef[];
  paymentMethods: PaymentMethodOption[];
  serviceFee: number;
  hasIdentityField: boolean;
};

export type Quote = {
  items: Array<{ inventoryId: number; ticketCategoryId: number; name: string; qty: number; unitPrice: number; lineTotal: number }>;
  subtotal: number;
  discount: number;
  fee: number;
  total: number;
  voucherError: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The database clock, which is what every `expires_at` is measured against. */
export async function databaseNow(): Promise<string> {
  const [{ now }] = await sql<{ now: Date }[]>`select now()`;
  return now.toISOString();
}

export function enabledPaymentMethods(methods: { qris: boolean; va: Record<string, boolean> }): PaymentMethodOption[] {
  return PAYMENT_METHODS.filter((m) => (m.key === "qris" ? methods.qris : methods.va[m.key])).map((m) => ({
    key: m.key,
    label: m.label,
    group: m.key === "qris" ? "qris" : "va",
  }));
}

export async function getHoldView(holdId: string, visitorId: string): Promise<HoldView | null> {
  if (!UUID.test(holdId)) return null;
  const [hold] = await sql<
    {
      id: string;
      status: HoldStatus;
      expires_at: Date;
      server_now: Date;
      order_uuid: string | null;
      event_id: number;
      slug: string;
      title: string;
      starts_at: Date;
      ends_at: Date;
      timezone: string;
      venue: string | null;
      city: string | null;
      poster_path: string | null;
    }[]
  >`
    select h.id, h.status, h.expires_at, now() as server_now, o.public_uuid as order_uuid,
           e.id as event_id, e.slug, e.title, e.starts_at, e.ends_at, e.timezone, e.venue, e.city, e.poster_path
      from holds h
      join events e on e.id = h.event_id
      left join orders o on o.hold_id = h.id
     where h.id = ${holdId} and h.visitor_id = ${visitorId}`;
  if (!hold) return null;

  const [items, fields, settings] = await Promise.all([
    sql<HoldView["items"]>`
      select hi.inventory_id as "inventoryId", c.name, hi.qty, hi.unit_price as "unitPrice",
             hi.qty * hi.unit_price as "lineTotal", c.admits_per_unit as "admitsPerUnit"
        from hold_items hi
        join ticket_inventory i on i.id = hi.inventory_id
        join ticket_categories c on c.id = i.ticket_category_id
       where hi.hold_id = ${holdId}
       order by c.position, c.id`,
    sql<FormFieldDef[]>`
      select id, key, label, type, options, validation, required, help_text as "helpText", placeholder,
             is_active as "isActive", position
        from form_fields
       where event_id = ${hold.event_id} and is_active
       order by position, id`,
    getTransactionSettings(),
  ]);

  return {
    id: hold.id,
    status: hold.status,
    expiresAt: hold.expires_at.toISOString(),
    serverNow: hold.server_now.toISOString(),
    orderUuid: hold.order_uuid,
    event: {
      id: hold.event_id,
      slug: hold.slug,
      title: hold.title,
      startsAt: hold.starts_at.toISOString(),
      endsAt: hold.ends_at.toISOString(),
      timezone: hold.timezone,
      venue: hold.venue ?? "",
      city: hold.city ?? "",
      posterPath: hold.poster_path,
    },
    items,
    fields,
    paymentMethods: enabledPaymentMethods(settings.paymentMethods),
    serviceFee: settings.serviceFee,
    hasIdentityField: fields.some((f) => f.type === "identity"),
  };
}

type RawQuote = {
  items: Array<{ inventory_id: number; ticket_category_id: number; name: string; qty: number; unit_price: number; line_total: number }>;
  subtotal: number;
  discount: number;
  fee: number;
  total: number;
  voucher_error: string | null;
};

export async function quoteHold(holdId: string, visitorId: string, voucherCode: string | null): Promise<Quote> {
  if (!UUID.test(holdId)) throw new UserError("Pesanan tidak ditemukan.", 404);
  try {
    const [{ quote }] = await sql<{ quote: RawQuote }[]>`
      select quote_hold(${holdId}::uuid, ${visitorId}::uuid, ${voucherCode}) as quote`;
    return {
      items: quote.items.map((i) => ({
        inventoryId: i.inventory_id,
        ticketCategoryId: i.ticket_category_id,
        name: i.name,
        qty: i.qty,
        unitPrice: Number(i.unit_price),
        lineTotal: Number(i.line_total),
      })),
      subtotal: Number(quote.subtotal),
      discount: Number(quote.discount),
      fee: Number(quote.fee),
      total: Number(quote.total),
      voucherError: quote.voucher_error,
    };
  } catch (e) {
    const engine = parseEngineError(e);
    if (engine?.code === "HOLD_NOT_FOUND") throw new UserError("Pesanan tidak ditemukan.", 404);
    if (engine?.code === "HOLD_EXPIRED") throw new UserError("Waktu habis, slot dilepas", 410);
    throw e;
  }
}
