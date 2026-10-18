import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_2FA_COOKIE,
  ADMIN_COOKIE,
  SESSION_TTL_MS,
  cookieOptions,
  createSessionValue,
  readSessionValue,
} from "@/lib/admin-session";
import { foreignOrigin } from "@/lib/admin-route";
import { claimTotpStep, getActiveAdmin, getTotpSecret, markLoggedIn } from "@/lib/admin-service";
import { readJson, str } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { totpStep } from "@/lib/totp";

export async function POST(req: NextRequest) {
  if (foreignOrigin(req)) return NextResponse.json({ error: "Permintaan ditolak." }, { status: 403 });
  const adminId = readSessionValue(req.cookies.get(ADMIN_2FA_COOKIE)?.value, Date.now(), "2fa");
  if (adminId === null) {
    return NextResponse.json(
      { error: "Sesi masuk berakhir. Masukkan email dan kata sandi lagi." },
      { status: 401 },
    );
  }
  if (!rateLimit(`2fa:${adminId}`, 5, 60_000)) {
    return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi sebentar lagi." }, { status: 429 });
  }

  const code = str((await readJson(req)).code).replace(/\s/g, "");
  const [admin, secret] = await Promise.all([getActiveAdmin(adminId), getTotpSecret(adminId)]);
  const step = admin && secret ? totpStep(secret, code) : null;
  if (step === null) {
    return NextResponse.json({ error: "Kode salah atau sudah kedaluwarsa." }, { status: 401 });
  }
  if (!(await claimTotpStep(adminId, step))) {
    return NextResponse.json({ error: "Kode ini sudah dipakai. Tunggu kode berikutnya di aplikasi autentikator." }, { status: 401 });
  }

  await markLoggedIn(adminId);
  const res = NextResponse.json({ next: "done" });
  res.cookies.set(ADMIN_COOKIE, createSessionValue(adminId), cookieOptions(SESSION_TTL_MS / 1000));
  res.cookies.set(ADMIN_2FA_COOKIE, "", cookieOptions(0));
  return res;
}
