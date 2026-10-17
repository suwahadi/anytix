import { UserError } from "@/lib/admin-route";
import { writeAudit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { parseEngineError } from "@/lib/db-errors";
import type { EmailType } from "@/lib/email/templates";
import { enqueueJob } from "@/lib/jobs";
import { maskIdentity } from "@/lib/mask";
import { cancelTransaction, MidtransError } from "@/lib/payments/midtrans";
import { applyPaymentStatus } from "@/lib/payments/payment-service";

export const ADMIN_ORDER_PAGE_SIZE = 20;

export type AdminOrderRow = {
  id: number;
  invoice: string;
  publicUuid: string;
  buyerName: string;
  buyerEmail: string;
  eventTitle: string;
  total: number;
  status: string;
  createdAt: Date;
  payExpiresAt: Date;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listAdminOrders(f: { q?: string; status?: string; eventId?: number; page: number }) {
  const q = f.q?.trim() ?? "";
  const pattern = q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
  const uuid = UUID.test(q) ? q.toLowerCase() : null;
  const status = f.status || null;
  const eventId = f.eventId ?? null;
  const page = Math.min(Math.max(1, Math.floor(f.page) || 1), 10_000);
  const where = sql`
    where (${pattern}::text is null or o.invoice_code ilike ${pattern} or o.buyer_email ilike ${pattern} or o.buyer_name ilike ${pattern}
           or o.public_uuid = ${uuid}::uuid)
      and (${status}::text is null or o.status = ${status})
      and (${eventId}::bigint is null or o.event_id = ${eventId})`;
  const [items, [{ total }]] = await Promise.all([
    sql<AdminOrderRow[]>`
      select o.id, o.invoice_code as invoice, o.public_uuid as "publicUuid", o.buyer_name as "buyerName", o.buyer_email as "buyerEmail",
             e.title as "eventTitle", o.total, o.status, o.created_at as "createdAt", o.pay_expires_at as "payExpiresAt"
        from orders o join events e on e.id = o.event_id
        ${where}
       order by o.created_at desc, o.id desc
       limit ${ADMIN_ORDER_PAGE_SIZE} offset ${(page - 1) * ADMIN_ORDER_PAGE_SIZE}`,
    sql<{ total: number }[]>`select count(*)::int as total from orders o ${where}`,
  ]);
  return { items: items.map((i) => ({ ...i, total: Number(i.total) })), total, pageSize: ADMIN_ORDER_PAGE_SIZE };
}

async function orderRow(id: number) {
  const [o] = await sql<
    {
      id: number;
      invoice_code: string;
      public_uuid: string;
      status: string;
      hold_id: string;
      event_id: number;
      title: string;
      slug: string;
      buyer_name: string;
      buyer_email: string;
      buyer_phone: string;
      subtotal: number;
      discount_amount: number;
      fee_amount: number;
      total: number;
      payment_method: string;
      pay_expires_at: Date;
      paid_at: Date | null;
      created_at: Date;
    }[]
  >`
    select o.id, o.invoice_code, o.public_uuid, o.status, o.hold_id, o.event_id, e.title, e.slug, o.buyer_name, o.buyer_email, o.buyer_phone,
           o.subtotal, o.discount_amount, o.fee_amount, o.total, o.payment_method, o.pay_expires_at, o.paid_at, o.created_at
      from orders o join events e on e.id = o.event_id
     where o.id = ${id}`;
  if (!o) throw new UserError("Pesanan tidak ditemukan.", 404);
  return o;
}

/** Admin detail; identity numbers are decrypted only to be masked (PRD §14: full reveal is a separate audited action). */
export async function getAdminOrder(id: number) {
  const o = await orderRow(id);
  const [items, payments, events, emails, answers] = await Promise.all([
    sql<{ name: string; qty: number; unitPrice: number }[]>`
      select c.name, hi.qty, hi.unit_price as "unitPrice"
        from hold_items hi join ticket_inventory i on i.id = hi.inventory_id join ticket_categories c on c.id = i.ticket_category_id
       where hi.hold_id = ${o.hold_id} order by c.position, c.id`,
    sql<{ attempt: number; midtransOrderId: string; paymentMethod: string; status: string; hasSnapToken: boolean; updatedAt: Date }[]>`
      select attempt, midtrans_order_id as "midtransOrderId", payment_method as "paymentMethod", status,
             snap_token is not null as "hasSnapToken", updated_at as "updatedAt"
        from payments where order_id = ${id} order by attempt`,
    sql<{ transactionStatus: string; receivedAt: Date }[]>`
      select e.transaction_status as "transactionStatus", e.received_at as "receivedAt"
        from payment_events e join payments p on p.midtrans_order_id = e.midtrans_order_id
       where p.order_id = ${id} order by e.received_at`,
    sql<{ type: string; toEmail: string; status: string; error: string | null; createdAt: Date }[]>`
      select type, to_email as "toEmail", status, error, created_at as "createdAt" from email_logs where order_id = ${id} order by created_at`,
    sql<{ label: string; type: string; value: unknown; value_encrypted: Buffer | null }[]>`
      select f.label, f.type, a.value, a.value_encrypted
        from order_answers a join form_fields f on f.id = a.form_field_id
       where a.order_id = ${id} order by f.position, f.id`,
  ]);
  return {
    id: o.id,
    invoice: o.invoice_code,
    publicUuid: o.public_uuid,
    status: o.status,
    event: { id: o.event_id, title: o.title, slug: o.slug },
    buyer: { name: o.buyer_name, email: o.buyer_email, phone: o.buyer_phone },
    subtotal: Number(o.subtotal),
    discount: Number(o.discount_amount),
    fee: Number(o.fee_amount),
    total: Number(o.total),
    paymentMethod: o.payment_method,
    payExpiresAt: o.pay_expires_at,
    paidAt: o.paid_at,
    createdAt: o.created_at,
    items: items.map((i) => ({ ...i, unitPrice: Number(i.unitPrice) })),
    payments,
    paymentEvents: events,
    emails,
    answers: answers.map((a) => ({
      label: a.label,
      type: a.type,
      value:
        a.type === "identity"
          ? { ...(a.value as { type: string }), number: a.value_encrypted ? maskIdentity(decrypt(Buffer.from(a.value_encrypted))) : "" }
          : a.value,
    })),
  };
}

export type AdminOrderDetail = Awaited<ReturnType<typeof getAdminOrder>>;

async function latestPayment(orderId: number) {
  const [p] = await sql<{ midtrans_order_id: string; snap_token: string | null }[]>`
    select midtrans_order_id, snap_token from payments where order_id = ${orderId} order by attempt desc limit 1`;
  return p;
}

export async function cancelOrder(adminId: number, id: number): Promise<void> {
  const o = await orderRow(id);
  if (o.status !== "awaiting_payment") throw new UserError("Hanya pesanan yang belum dibayar yang bisa dibatalkan.", 409);
  const p = await latestPayment(id);
  if (p.snap_token) {
    try {
      await cancelTransaction(p.midtrans_order_id);
    } catch (e) {
      if (e instanceof MidtransError) throw new UserError("Midtrans menolak pembatalan. Coba lagi sebentar lagi.", 502);
      throw e;
    }
  }
  const result = await applyPaymentStatus(p.midtrans_order_id, "cancel", { source: "admin", admin_id: adminId });
  if (result.status !== "cancelled") throw new UserError("Status pesanan baru saja berubah. Muat ulang halaman.", 409);
  await writeAudit(sql, { adminId, action: "cancel", entity: "order", entityId: id });
}

const EMAIL_FOR_STATUS: Record<string, EmailType> = {
  awaiting_payment: "awaiting_payment",
  paid: "paid",
  expired: "expired",
  late_paid_review: "late_paid",
};

export async function resendOrderEmail(adminId: number, id: number, input: { to?: string; updateBuyerEmail?: boolean }): Promise<void> {
  const o = await orderRow(id);
  const type = EMAIL_FOR_STATUS[o.status];
  if (!type) throw new UserError("Email tidak bisa dikirim untuk status pesanan ini.", 409);
  const to = input.to?.trim().toLowerCase() || undefined;
  if (to && input.updateBuyerEmail) await sql`update orders set buyer_email = ${to}, updated_at = now() where id = ${id}`;
  await enqueueJob("email", { type, order_id: id, ...(to ? { to } : {}) }, `email:${type}:${id}:resend:${Date.now()}`);
  await writeAudit(sql, {
    adminId,
    action: "resend_email",
    entity: "order",
    entityId: id,
    diff: { type, to: to ?? o.buyer_email, buyerEmailUpdated: Boolean(to && input.updateBuyerEmail) },
  });
}

export async function issueLateTickets(adminId: number, id: number): Promise<void> {
  try {
    await sql`select id from issue_late_order(${id})`;
  } catch (e) {
    const engine = parseEngineError(e);
    if (engine?.code === "SOLD_OUT") throw new UserError("Kuota belum cukup. Naikkan kuota kategori tiket dulu.", 409);
    if (engine?.code === "INVALID_STATE") throw new UserError("Pesanan ini tidak sedang menunggu tindak lanjut.", 409);
    throw e;
  }
  await writeAudit(sql, { adminId, action: "issue_late", entity: "order", entityId: id });
}

export async function reissueTickets(adminId: number, id: number): Promise<number> {
  let count: number;
  try {
    [{ count }] = await sql<{ count: number }[]>`select reissue_ticket_tokens(${id}) as count`;
  } catch (e) {
    if (parseEngineError(e)?.code === "INVALID_STATE") throw new UserError("QR hanya bisa diterbitkan ulang untuk pesanan yang lunas.", 409);
    throw e;
  }
  await writeAudit(sql, { adminId, action: "reissue_tickets", entity: "order", entityId: id, diff: { count } });
  return count;
}

export async function markOrderRefunded(adminId: number, id: number): Promise<void> {
  const rows = await sql`update orders set status = 'refunded', updated_at = now() where id = ${id} and status = 'late_paid_review' returning id`;
  if (rows.length === 0) throw new UserError("Hanya pesanan yang perlu tindak lanjut yang bisa ditandai sudah direfund.", 409);
  await writeAudit(sql, { adminId, action: "mark_refunded", entity: "order", entityId: id });
}

export async function countLatePaid(): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from orders where status = 'late_paid_review'`;
  return n;
}
