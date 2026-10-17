import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs";
import { verifyNotificationSignature } from "@/lib/payments/midtrans";
import { syncPaymentStatus } from "@/lib/payments/payment-service";

type Notification = { order_id: string; status_code: string; gross_amount: string; signature_key: string };

function isNotification(body: unknown): body is Notification {
  const b = body as Record<string, unknown>;
  return Boolean(b) && ["order_id", "status_code", "gross_amount", "signature_key"].every((k) => typeof b[k] === "string");
}

export async function POST(req: NextRequest) {
  const body: unknown = await req.json().catch(() => null);
  if (!isNotification(body) || !verifyNotificationSignature(body)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  try {
    await syncPaymentStatus(body.order_id);
  } catch (e) {
    // Answering 200 stops Midtrans retrying, so schedule our own re-check before the hold can expire and free the slot.
    console.error(`webhook sync failed for ${body.order_id}: ${e instanceof Error ? e.message : String(e)}`);
    try {
      const [p] = await sql<{ order_id: number }[]>`select order_id from payments where midtrans_order_id = ${body.order_id}`;
      if (p) await enqueueJob("payment-check", { order_id: p.order_id }, `payment-check:${p.order_id}:webhook:${Date.now()}`, new Date(Date.now() + 30_000));
    } catch (inner) {
      console.error(`webhook re-check could not be queued for ${body.order_id}: ${inner instanceof Error ? inner.message : String(inner)}`);
    }
  }
  return NextResponse.json({ ok: true });
}
