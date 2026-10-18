import { NextResponse, type NextRequest } from "next/server";
import { getOrderView } from "@/lib/booking/order-view";
import { clientIp, ipLimit, rateLimit } from "@/lib/rate-limit";

function json(body: unknown, status = 200): NextResponse {
  const res = NextResponse.json(body, { status });
  res.headers.set("cache-control", "no-store");
  res.headers.set("referrer-policy", "no-referrer");
  return res;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  if (!rateLimit(`orders:${clientIp(req.headers)}`, ipLimit(60), 60_000)) return json({ error: "Terlalu banyak permintaan. Coba lagi sebentar lagi." }, 429);
  const view = await getOrderView((await params).uuid);
  if (!view) return json({ error: "Pesanan tidak ditemukan." }, 404);
  return json(view);
}
