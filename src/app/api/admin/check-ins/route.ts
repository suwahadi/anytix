import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute } from "@/lib/admin-route";
import { checkIn } from "@/lib/checkin/checkin-service";
import { rateLimit } from "@/lib/rate-limit";

const scanInput = z.object({
  token: z.string().trim().min(1, "Isi kode tiket.").max(64, "Kode tiket tidak valid."),
  eventId: z.number().int().positive(),
  gate: z.string().trim().min(1, "Isi nama gate.").max(40, "Nama gate maksimal 40 karakter."),
});

export const POST = adminRoute(scanInput, async ({ admin, body }) => {
  // Gate staff share admin accounts (PRD §4), so the limit is per account across several phones.
  if (!rateLimit(`checkin:${admin.id}`, 600, 60_000)) {
    return NextResponse.json({ error: "Terlalu banyak scan. Tunggu sebentar." }, { status: 429 });
  }
  return NextResponse.json(await checkIn(admin.id, body));
});
