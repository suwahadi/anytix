import { NextResponse, type NextRequest } from "next/server";
import { foreignOrigin } from "@/lib/admin-route";
import { findOrderUuid, normalizeInvoice } from "@/lib/booking/track-order";
import { readJson, str } from "@/lib/http";
import { clientIp, ipLimit, rateLimit } from "@/lib/rate-limit";

const NOT_FOUND = "Kode pesanan atau email tidak cocok. Periksa data pesanan Anda.";

function json(body: unknown, status = 200): NextResponse {
  const res = NextResponse.json(body, { status });
  res.headers.set("cache-control", "no-store");
  return res;
}

export async function POST(req: NextRequest) {
  if (foreignOrigin(req)) return json({ error: "Permintaan ditolak." }, 403);
  if (!rateLimit(`orders-track:${clientIp(req.headers)}`, ipLimit(10), 60_000)) {
    return json({ error: "Terlalu banyak percobaan. Coba lagi dalam satu menit." }, 429);
  }
  const body = await readJson(req);
  const invoice = normalizeInvoice(str(body.invoice));
  const email = str(body.email).trim();
  if (!invoice || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: NOT_FOUND }, 404);
  const uuid = await findOrderUuid(invoice, email);
  if (!uuid) return json({ error: NOT_FOUND }, 404);
  return json({ href: `/orders/${uuid}` });
}
