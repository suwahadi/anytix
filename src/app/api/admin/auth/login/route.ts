import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_2FA_COOKIE,
  ADMIN_COOKIE,
  SESSION_TTL_MS,
  TWO_FA_TTL_MS,
  cookieOptions,
  createSessionValue,
} from "@/lib/admin-session";
import { foreignOrigin } from "@/lib/admin-route";
import { findAdminByEmail, markLoggedIn } from "@/lib/admin-service";
import { readJson, str } from "@/lib/http";
import { hashPassword, verifyPassword } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/rate-limit";

let dummyHash: Promise<string> | undefined;

export async function POST(req: NextRequest) {
  if (foreignOrigin(req)) return NextResponse.json({ error: "Permintaan ditolak." }, { status: 403 });
  const body = await readJson(req);
  const email = str(body.email).trim().toLowerCase();
  const password = str(body.password);
  // The per-email limit also holds when a client rotates X-Forwarded-For to dodge the per-IP limit.
  if (!rateLimit(`login:${clientIp(req.headers)}|${email}`, 5, 60_000) || !rateLimit(`login-email:${email}`, 20, 15 * 60_000)) {
    return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi sebentar lagi." }, { status: 429 });
  }

  const admin = email ? await findAdminByEmail(email) : null;
  // Hash even for unknown emails so response time does not reveal which emails exist.
  const stored = admin?.password_hash ?? (await (dummyHash ??= hashPassword("x".repeat(16))));
  const valid = await verifyPassword(password, stored);
  if (!admin || !valid || !admin.is_active) {
    return NextResponse.json({ error: "Email atau kata sandi salah." }, { status: 401 });
  }

  if (admin.totp_secret_enc) {
    const res = NextResponse.json({ next: "2fa" });
    res.cookies.set(
      ADMIN_2FA_COOKIE,
      createSessionValue(admin.id, Date.now(), TWO_FA_TTL_MS, "2fa"),
      cookieOptions(TWO_FA_TTL_MS / 1000),
    );
    return res;
  }

  await markLoggedIn(admin.id);
  const res = NextResponse.json({ next: "done" });
  res.cookies.set(ADMIN_COOKIE, createSessionValue(admin.id), cookieOptions(SESSION_TTL_MS / 1000));
  return res;
}
