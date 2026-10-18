import { NextResponse } from "next/server";
import { z } from "zod";
import { changeOwnPassword } from "@/lib/admin/admin-accounts";
import { adminRoute } from "@/lib/admin-route";
import { ADMIN_COOKIE, cookieOptions, createSessionValue, SESSION_TTL_MS } from "@/lib/admin-session";
import { rateLimit } from "@/lib/rate-limit";

const passwordInput = z.object({ current: z.string().max(200), next: z.string().max(200) });

export const POST = adminRoute(passwordInput, async ({ admin, body }) => {
  if (!rateLimit(`password:${admin.id}`, 5, 60_000)) {
    return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi sebentar lagi." }, { status: 429 });
  }
  await changeOwnPassword(admin.id, body);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, createSessionValue(admin.id), cookieOptions(SESSION_TTL_MS / 1000));
  return res;
});
