import { NextResponse } from "next/server";
import { z } from "zod";
import { quoteHold } from "@/lib/booking/hold-view";
import { visitorRoute } from "@/lib/public-route";

const quoteInput = z.object({ voucherCode: z.string().trim().max(40).optional() });

export const POST = visitorRoute(quoteInput, async ({ visitorId, params, body }) => {
  return NextResponse.json(await quoteHold(params.id, visitorId, body.voucherCode || null));
});
