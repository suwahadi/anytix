import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseNow } from "@/lib/booking/hold-view";
import { holdErrorResponse } from "@/lib/booking/hold-errors";
import { sql } from "@/lib/db";
import { HoldError, reserveTickets } from "@/lib/hold-service";
import { visitorRoute } from "@/lib/public-route";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { singleFlight } from "@/lib/single-flight";
import { verifyTurnstile } from "@/lib/turnstile";

const holdInput = z.object({
  eventId: z.number().int().positive(),
  items: z
    .array(z.object({ inventoryId: z.number().int().positive(), qty: z.number().int().min(1).max(50) }))
    .min(1, "Pilih minimal satu tiket.")
    .max(20),
  turnstileToken: z.string().max(2048).default(""),
});

const TOO_MANY = "Terlalu banyak percobaan. Coba lagi sebentar lagi.";

export const POST = visitorRoute(holdInput, async ({ visitorId, req, body }) => {
  const key = req.headers.get("idempotency-key") ?? "";
  if (key.length < 8 || key.length > 100) {
    return NextResponse.json({ error: "Muat ulang halaman lalu coba lagi.", fields: { idempotencyKey: "Tidak valid." } }, { status: 422 });
  }
  const ip = clientIp(req.headers);
  if (!rateLimit(`holds:visitor:${visitorId}`, 10, 60_000) || !rateLimit(`holds:ip:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: TOO_MANY }, { status: 429 });
  }

  const [existing] = await sql<{ id: string; expires_at: Date }[]>`
    select id, expires_at from holds where visitor_id = ${visitorId} and idempotency_key = ${key}`;
  if (existing) {
    return NextResponse.json({ holdId: existing.id, expiresAt: existing.expires_at.toISOString(), serverNow: await databaseNow() });
  }

  const res = await singleFlight(`hold:${visitorId}:${key}`, async () => {
    if (!(await verifyTurnstile(body.turnstileToken, ip === "local" ? null : ip))) {
      return NextResponse.json({ error: "Verifikasi keamanan gagal. Coba lagi." }, { status: 403 });
    }
    try {
      const hold = await reserveTickets({ visitorId, eventId: body.eventId, items: body.items, idempotencyKey: key });
      return NextResponse.json({ holdId: hold.id, expiresAt: hold.expiresAt.toISOString(), serverNow: await databaseNow() }, { status: 201 });
    } catch (e) {
      if (!(e instanceof HoldError)) throw e;
      const ids = body.items.map((i) => i.inventoryId);
      const rows = await sql<{ id: number; name: string }[]>`
        select i.id, c.name from ticket_inventory i join ticket_categories c on c.id = i.ticket_category_id where i.id = any(${ids})`;
      return holdErrorResponse(e, new Map(rows.map((r) => [r.id, r.name])));
    }
  });
  return res.clone();
});
