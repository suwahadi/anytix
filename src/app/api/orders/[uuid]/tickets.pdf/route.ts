import type { NextRequest } from "next/server";
import { getTicketsPdfData } from "@/lib/booking/order-view";
import { clientIp, ipLimit, rateLimit } from "@/lib/rate-limit";
import { renderTicketsPdf } from "@/lib/tickets/ticket-pdf";

const PRIVATE = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

export async function GET(req: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  if (!rateLimit(`tickets-pdf:${clientIp(req.headers)}`, ipLimit(20), 60_000)) {
    return Response.json({ error: "Terlalu banyak permintaan. Coba lagi sebentar lagi." }, { status: 429, headers: PRIVATE });
  }
  const data = await getTicketsPdfData((await params).uuid);
  if (!data) return Response.json({ error: "E-ticket tidak ditemukan." }, { status: 404, headers: PRIVATE });
  const pdf = await renderTicketsPdf(data);
  return new Response(new Uint8Array(pdf), {
    headers: {
      ...PRIVATE,
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="e-ticket-${data.invoice}.pdf"`,
    },
  });
}
