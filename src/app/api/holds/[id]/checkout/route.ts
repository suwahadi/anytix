import { NextResponse } from "next/server";
import { z } from "zod";
import { buyerInput } from "@/lib/booking/buyer";
import { checkoutHold } from "@/lib/booking/checkout-service";
import { sql } from "@/lib/db";
import { ensureSnapToken } from "@/lib/payments/payment-service";
import { visitorRoute } from "@/lib/public-route";
import { clientIp } from "@/lib/rate-limit";
import { singleFlight } from "@/lib/single-flight";
import { verifyTurnstile } from "@/lib/turnstile";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const checkoutInput = z.object({
  turnstileToken: z.string().max(2048).default(""),
  buyer: buyerInput,
  answers: z.record(z.string(), z.unknown()).default({}),
  paymentMethod: z.string().max(20),
  consents: z.object({ terms: z.boolean().default(false), privacy: z.boolean().default(false) }),
});

export const POST = visitorRoute(checkoutInput, async ({ visitorId, req, params, body }) => {
  if (!UUID.test(params.id)) return NextResponse.json({ error: "Pesanan tidak ditemukan." }, { status: 404 });
  const [existing] = await sql<{ public_uuid: string }[]>`
    select o.public_uuid from orders o join holds h on h.id = o.hold_id
     where o.hold_id = ${params.id} and h.visitor_id = ${visitorId}`;
  if (existing) return NextResponse.json({ orderUuid: existing.public_uuid });

  const ip = clientIp(req.headers);
  const knownIp = ip === "local" ? null : ip;
  const res = await singleFlight(`checkout:${visitorId}:${params.id}`, async () => {
    if (!(await verifyTurnstile(body.turnstileToken, knownIp))) {
      return NextResponse.json({ error: "Verifikasi keamanan gagal. Coba lagi." }, { status: 403 });
    }
    const order = await checkoutHold({
      holdId: params.id,
      visitorId,
      buyer: body.buyer,
      answers: body.answers,
      paymentMethod: body.paymentMethod,
      consents: body.consents,
      ip: knownIp,
    });
    await ensureSnapToken(order.orderId);
    return NextResponse.json({ orderUuid: order.orderUuid }, { status: 201 });
  });
  return res.clone();
});
