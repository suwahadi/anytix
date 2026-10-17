import { NextResponse, type NextRequest } from "next/server";
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
    // Answering 200 stops Midtrans retry storms; payment-check and reconciliation repair the state later.
    console.error(`webhook sync failed for ${body.order_id}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return NextResponse.json({ ok: true });
}
