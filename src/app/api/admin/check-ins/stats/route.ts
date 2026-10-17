import { NextResponse } from "next/server";
import { adminRoute, UserError } from "@/lib/admin-route";
import { checkinHistory, checkinStats } from "@/lib/checkin/checkin-service";

export const GET = adminRoute(null, async ({ req }) => {
  const p = req.nextUrl.searchParams;
  const eventId = Number(p.get("eventId"));
  if (!Number.isInteger(eventId) || eventId <= 0) throw new UserError("Pilih event.", 422);
  const [stats, history] = await Promise.all([
    checkinStats(eventId),
    checkinHistory(eventId, { result: p.get("result") ?? undefined, page: Number(p.get("page") ?? 1) }),
  ]);
  return NextResponse.json({ stats, history });
});
