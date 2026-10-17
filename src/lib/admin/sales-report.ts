import { ORDER_STATUS } from "@/app/admin/(panel)/orders/order-labels";
import { writeAudit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { toCsv } from "@/lib/csv";
import { sql } from "@/lib/db";
import { maskIdentity } from "@/lib/mask";
import { PAYMENT_METHODS } from "@/lib/validation/settings";

const BASE_HEADER = ["Invoice", "Dibuat", "Dibayar", "Status", "Event", "Nama", "Email", "WhatsApp", "Item", "Subtotal", "Diskon", "Kode Promo", "Biaya Layanan", "Total", "Metode"];

function stamp(at: Date | null, timezone: string): string {
  if (!at) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

function methodLabel(key: string): string {
  const m = PAYMENT_METHODS.find((p) => p.key === key);
  if (!m) return key;
  return m.key === "qris" ? "QRIS" : `Virtual Account ${m.label}`;
}

function answerCell(type: string, value: unknown, encrypted: Buffer | null): string {
  if (type === "identity") {
    const kind = (value as { type?: string } | null)?.type ?? "";
    return encrypted ? `${kind} ${maskIdentity(decrypt(Buffer.from(encrypted)))}`.trim() : "";
  }
  if (Array.isArray(value)) return value.join(", ");
  return value === null || value === undefined ? "" : String(value);
}

/** Orders export for the panel; identity numbers are masked like everywhere outside the audited reveal (PRD §14). */
export async function ordersCsv(adminId: number, f: { eventId?: number; status?: string }): Promise<{ filename: string; body: string }> {
  const eventId = f.eventId ?? null;
  const status = f.status || null;
  const orders = await sql<
    {
      id: number;
      invoice_code: string;
      created_at: Date;
      paid_at: Date | null;
      status: string;
      title: string;
      timezone: string;
      buyer_name: string;
      buyer_email: string;
      buyer_phone: string;
      items: string | null;
      subtotal: number;
      discount_amount: number;
      code: string | null;
      fee_amount: number;
      total: number;
      payment_method: string;
    }[]
  >`
    select o.id, o.invoice_code, o.created_at, o.paid_at, o.status, e.title, e.timezone, o.buyer_name, o.buyer_email, o.buyer_phone,
           (select string_agg(c.name || ' ×' || hi.qty, '; ' order by c.position, c.id)
              from hold_items hi join ticket_inventory i on i.id = hi.inventory_id join ticket_categories c on c.id = i.ticket_category_id
             where hi.hold_id = o.hold_id) as items,
           o.subtotal, o.discount_amount, v.code, o.fee_amount, o.total, o.payment_method
      from orders o
      join events e on e.id = o.event_id
      left join vouchers v on v.id = o.voucher_id
     where (${eventId}::bigint is null or o.event_id = ${eventId}) and (${status}::text is null or o.status = ${status})
     order by o.created_at, o.id`;

  const fields = eventId
    ? await sql<{ id: number; label: string; type: string }[]>`
        select id, label, type from form_fields where event_id = ${eventId} order by position, id`
    : [];
  const answers = new Map<string, string>();
  if (fields.length > 0 && orders.length > 0) {
    const rows = await sql<{ order_id: number; form_field_id: number; value: unknown; value_encrypted: Buffer | null }[]>`
      select order_id, form_field_id, value, value_encrypted from order_answers where order_id = any(${orders.map((o) => o.id)})`;
    const types = new Map(fields.map((x) => [x.id, x.type]));
    for (const a of rows) answers.set(`${a.order_id}:${a.form_field_id}`, answerCell(types.get(a.form_field_id) ?? "", a.value, a.value_encrypted));
  }

  const body = toCsv(
    [...BASE_HEADER, ...fields.map((x) => x.label)],
    orders.map((o) => [
      o.invoice_code,
      stamp(o.created_at, o.timezone),
      stamp(o.paid_at, o.timezone),
      ORDER_STATUS[o.status]?.label ?? o.status,
      o.title,
      o.buyer_name,
      o.buyer_email,
      o.buyer_phone,
      o.items ?? "",
      Number(o.subtotal),
      Number(o.discount_amount),
      o.code ?? "",
      Number(o.fee_amount),
      Number(o.total),
      methodLabel(o.payment_method),
      ...fields.map((x) => answers.get(`${o.id}:${x.id}`) ?? ""),
    ]),
  );

  const [slug] = eventId ? await sql<{ slug: string }[]>`select slug from events where id = ${eventId}` : [];
  const day = stamp(new Date(), "Asia/Jakarta").slice(0, 10).replace(/-/g, "");
  await writeAudit(sql, { adminId, action: "export", entity: "orders", entityId: eventId ?? "all", diff: { eventId, status, rows: orders.length } });
  return { filename: `pesanan-${slug?.slug ?? "semua"}-${day}.csv`, body };
}
