import { NextResponse } from "next/server";
import { z } from "zod";
import { quoteHold } from "@/lib/booking/hold-view";
import { visitorRoute } from "@/lib/public-route";
import { rateLimit } from "@/lib/rate-limit";

const quoteInput = z.object({ voucherCode: z.string().trim().max(40).optional() });

export const POST = visitorRoute(quoteInput, async ({ visitorId, params, body }) => {
  const code = body.voucherCode || null;
  if (code && !rateLimit(`quote-voucher:${visitorId}`, 10, 60_000)) {
    return NextResponse.json({ error: "Terlalu banyak percobaan kode promo. Coba lagi sebentar lagi." }, { status: 429 });
  }
  return NextResponse.json(await quoteHold(params.id, visitorId, code));
});
