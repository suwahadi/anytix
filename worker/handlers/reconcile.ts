import { sql } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs";
import { getTransactionSettings } from "@/lib/settings";

export function hourKey(now = new Date()): string {
  return now.toISOString().slice(0, 13);
}

/** Hourly: fix held/sold drift (PRD §10.4 layer 4) and re-poll payments Midtrans never told us about. */
export async function reconcileJob(): Promise<void> {
  const hour = hourKey();
  const drift = await sql`select * from reconcile_inventory(true)`;
  if (drift.length > 0) await enqueueJob("admin-alert", { kind: "drift", rows: drift }, `admin-alert:drift:${hour}`);

  const { payMinutes } = await getTransactionSettings();
  const stale = await sql<{ id: number }[]>`
    select distinct o.id
      from orders o join payments p on p.order_id = o.id
     where o.status = 'awaiting_payment' and p.status = 'pending'
       and o.created_at < now() - make_interval(mins => ${payMinutes + 10})`;
  for (const o of stale) await enqueueJob("payment-check", { order_id: o.id }, `payment-check:${o.id}:recon:${hour}`);
}
