import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { midtransClientKey, snapScriptUrl } from "@/lib/payments/midtrans";
import { ensureSnapToken } from "@/lib/payments/payment-service";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): NextResponse {
  const res = NextResponse.json(body, { status });
  res.headers.set("cache-control", "no-store");
  res.headers.set("referrer-policy", "no-referrer");
  return res;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  if (!rateLimit(`orders-pay:${clientIp(req.headers)}`, 20, 60_000)) return json({ error: "Terlalu banyak percobaan. Coba lagi sebentar lagi." }, 429);
  const { uuid } = await params;
  if (!UUID.test(uuid)) return json({ error: "Pesanan tidak ditemukan." }, 404);
  const [order] = await sql<{ id: number }[]>`select id from orders where public_uuid = ${uuid}`;
  if (!order) return json({ error: "Pesanan tidak ditemukan." }, 404);
  const result = await ensureSnapToken(order.id);
  if ("error" in result) return json({ error: result.error }, 409);
  return json({ token: result.token, clientKey: midtransClientKey(), scriptUrl: snapScriptUrl() });
}
