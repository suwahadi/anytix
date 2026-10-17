import { NextResponse } from "next/server";
import { z } from "zod";
import { changeOwnPassword } from "@/lib/admin/admin-accounts";
import { adminRoute } from "@/lib/admin-route";
import { rateLimit } from "@/lib/rate-limit";

const passwordInput = z.object({ current: z.string().max(200), next: z.string().max(200) });

export const POST = adminRoute(passwordInput, async ({ admin, body }) => {
  if (!rateLimit(`password:${admin.id}`, 5, 60_000)) {
    return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi sebentar lagi." }, { status: 429 });
  }
  await changeOwnPassword(admin.id, body);
  return NextResponse.json({ ok: true });
});
