import { sql } from "@/lib/db";
import { createSnapTransaction, getTransactionStatus, MidtransError, toEngineStatus, type EngineStatus } from "@/lib/payments/midtrans";
import { buildSnapPayload } from "@/lib/payments/snap-payload";

type PaymentRow = {
  payment_id: number;
  midtrans_order_id: string;
  snap_token: string | null;
  payment_method: string;
  order_status: string;
  past_due: boolean;
  created_at: Date;
  pay_expires_at: Date;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  discount_amount: number;
  fee_amount: number;
  total: number;
  hold_id: string;
};

async function latestPayment(orderId: number): Promise<PaymentRow | undefined> {
  const [row] = await sql<PaymentRow[]>`
    select p.id as payment_id, p.midtrans_order_id, p.snap_token, p.payment_method,
           o.status as order_status, o.pay_expires_at <= now() as past_due, o.created_at, o.pay_expires_at,
           o.buyer_name, o.buyer_email, o.buyer_phone, o.discount_amount, o.fee_amount, o.total, o.hold_id
      from orders o join payments p on p.order_id = o.id
     where o.id = ${orderId}
     order by p.attempt desc
     limit 1`;
  return row;
}

const NOT_READY = "Pembayaran belum bisa disiapkan. Coba lagi sebentar lagi.";

/** Snap token for the order's latest payment attempt, created on first use and reused while the order is pending. */
export async function ensureSnapToken(orderId: number): Promise<{ token: string } | { error: string }> {
  const p = await latestPayment(orderId);
  if (!p) return { error: NOT_READY };
  if (p.order_status !== "awaiting_payment" || p.past_due) return { error: "Batas bayar sudah lewat." };
  if (p.snap_token) return { token: p.snap_token };

  const items = await sql<{ ticketCategoryId: number; name: string; qty: number; unitPrice: number }[]>`
    select c.id as "ticketCategoryId", c.name, hi.qty, hi.unit_price as "unitPrice"
      from hold_items hi
      join ticket_inventory i on i.id = hi.inventory_id
      join ticket_categories c on c.id = i.ticket_category_id
     where hi.hold_id = ${p.hold_id}
     order by c.position, c.id`;
  const payload = buildSnapPayload({
    midtransOrderId: p.midtrans_order_id,
    createdAt: p.created_at,
    payExpiresAt: p.pay_expires_at,
    paymentMethod: p.payment_method,
    buyer: { name: p.buyer_name, email: p.buyer_email, phone: p.buyer_phone },
    items: items.map((i) => ({ ...i, unitPrice: Number(i.unitPrice) })),
    discount: Number(p.discount_amount),
    fee: Number(p.fee_amount),
    total: Number(p.total),
  });

  try {
    const snap = await createSnapTransaction(payload);
    await sql`update payments set snap_token = ${snap.token}, redirect_url = ${snap.redirectUrl}, updated_at = now()
               where id = ${p.payment_id} and snap_token is null`;
    const [stored] = await sql<{ snap_token: string }[]>`select snap_token from payments where id = ${p.payment_id}`;
    return { token: stored.snap_token };
  } catch (e) {
    if (!(e instanceof MidtransError)) throw e;
    // A parallel request may have created the token first, which makes Midtrans reject this order_id as taken.
    const [stored] = await sql<{ snap_token: string | null }[]>`select snap_token from payments where id = ${p.payment_id}`;
    if (stored?.snap_token) return { token: stored.snap_token };
    // shortcut: a Snap call that succeeded at Midtrans but whose response was lost leaves this order_id unusable; the buyer then needs CS, until attempt rotation is built.
    console.error(`snap token failed for order ${orderId}: HTTP ${e.status}`);
    return { error: NOT_READY };
  }
}

export type ApplyResult = { found: boolean; orderId?: number; publicUuid?: string; status?: string; changed?: boolean };

export async function applyPaymentStatus(midtransOrderId: string, status: EngineStatus, payload: object): Promise<ApplyResult> {
  const [{ result }] = await sql<{ result: { found: boolean; order_id?: number; public_uuid?: string; status?: string; changed?: boolean } }[]>`
    select apply_payment_status(${midtransOrderId}, ${status}, ${sql.json(payload as never)}) as result`;
  return { found: result.found, orderId: result.order_id, publicUuid: result.public_uuid, status: result.status, changed: result.changed };
}

/** Get Status is the source of truth (PRD §12): a notification only tells us which payment to look at. */
export async function syncPaymentStatus(midtransOrderId: string): Promise<{ midtrans: "missing" | "pending" | "applied"; result?: ApplyResult }> {
  const status = await getTransactionStatus(midtransOrderId);
  if (!status) return { midtrans: "missing" };
  const engine = toEngineStatus(status);
  if (!engine) {
    await sql`update payments set raw_last = ${sql.json(status as never)}, updated_at = now() where midtrans_order_id = ${midtransOrderId}`;
    return { midtrans: "pending" };
  }
  return { midtrans: "applied", result: await applyPaymentStatus(midtransOrderId, engine, status) };
}
