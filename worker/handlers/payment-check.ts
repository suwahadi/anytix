import { sql } from "@/lib/db";
import { expireTransaction } from "@/lib/payments/midtrans";
import { applyPaymentStatus, syncPaymentStatus } from "@/lib/payments/payment-service";

/** Runs after the sweeper released an unpaid order's slots, and from reconciliation for stale pending payments. */
export async function paymentCheckJob(payload: Record<string, unknown>): Promise<void> {
  const orderId = Number(payload.order_id);
  const [row] = await sql<{ status: string; past_due: boolean; midtrans_order_id: string }[]>`
    select o.status, o.pay_expires_at <= now() as past_due, p.midtrans_order_id
      from orders o join payments p on p.order_id = o.id
     where o.id = ${orderId}
     order by p.attempt desc
     limit 1`;
  if (!row || row.status !== "awaiting_payment") return;

  const result = await syncPaymentStatus(row.midtrans_order_id);
  if (!row.past_due || result.midtrans === "applied") return;
  if (result.midtrans === "pending") await expireTransaction(row.midtrans_order_id);
  // A missing transaction means the buyer never opened Snap, so no payment can arrive after the deadline.
  await applyPaymentStatus(row.midtrans_order_id, "expire", { source: "payment-check", midtrans: result.midtrans });
}
