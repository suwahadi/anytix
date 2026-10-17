import { NextResponse } from "next/server";
import { getHoldView } from "@/lib/booking/hold-view";
import { releaseHold } from "@/lib/hold-service";
import { visitorRoute } from "@/lib/public-route";

export const GET = visitorRoute(null, async ({ visitorId, params }) => {
  const view = await getHoldView(params.id, visitorId);
  if (!view) return NextResponse.json({ error: "Pesanan tidak ditemukan." }, { status: 404 });
  return NextResponse.json(view);
});

export const DELETE = visitorRoute(null, async ({ visitorId, params }) => {
  const view = await getHoldView(params.id, visitorId);
  if (!view) return NextResponse.json({ error: "Pesanan tidak ditemukan." }, { status: 404 });
  return NextResponse.json({ released: await releaseHold(view.id, visitorId) });
});
