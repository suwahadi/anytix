import { NextResponse } from "next/server";
import { listAdminOrders } from "@/lib/admin/order-admin-service";
import { adminRoute } from "@/lib/admin-route";

export const GET = adminRoute(null, async ({ req }) => {
  const p = req.nextUrl.searchParams;
  const eventId = Number(p.get("eventId"));
  const result = await listAdminOrders({
    q: p.get("q") ?? undefined,
    status: p.get("status") ?? undefined,
    eventId: Number.isSafeInteger(eventId) && eventId > 0 ? eventId : undefined,
    page: Number(p.get("page")) || 1,
  });
  return NextResponse.json(result);
});
