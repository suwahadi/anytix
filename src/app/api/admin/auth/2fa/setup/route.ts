import QRCode from "qrcode";
import { NextResponse, type NextRequest } from "next/server";
import { foreignOrigin } from "@/lib/admin-route";
import { getTotpSecret, requireAdmin, setTotpSecret } from "@/lib/admin-service";
import { readJson, str } from "@/lib/http";
import { getSetting } from "@/lib/settings";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp";

const unauthorized = () => NextResponse.json({ error: "Sesi berakhir. Silakan masuk lagi." }, { status: 401 });
const forbidden = () => NextResponse.json({ error: "Permintaan ditolak." }, { status: 403 });
const noStore = { headers: { "cache-control": "no-store" } };

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();
  if (await getTotpSecret(admin.id)) return NextResponse.json({ enabled: true }, noStore);
  const secret = generateTotpSecret();
  const site = await getSetting<{ name: string }>("site");
  const uri = totpUri(secret, admin.email, site.name || "Anytix");
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 240 });
  return NextResponse.json({ enabled: false, secret, uri, qr }, noStore);
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();
  if (foreignOrigin(req)) return forbidden();
  if (await getTotpSecret(admin.id)) {
    return NextResponse.json(
      { error: "Verifikasi dua langkah sudah aktif. Matikan dulu dengan kode yang berlaku sebelum memasang yang baru." },
      { status: 409 },
    );
  }
  const body = await readJson(req);
  const secret = str(body.secret);
  const code = str(body.code).replace(/\s/g, "");
  if (!/^[A-Z2-7]{32}$/.test(secret) || !verifyTotp(secret, code)) {
    return NextResponse.json(
      { error: "Kode tidak cocok. Pastikan jam di ponsel sudah benar, lalu coba lagi." },
      { status: 400 },
    );
  }
  await setTotpSecret(admin.id, secret);
  return NextResponse.json({ enabled: true });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();
  if (foreignOrigin(req)) return forbidden();
  const secret = await getTotpSecret(admin.id);
  const code = str((await readJson(req)).code).replace(/\s/g, "");
  if (!secret || !verifyTotp(secret, code)) {
    return NextResponse.json({ error: "Kode salah atau sudah kedaluwarsa." }, { status: 400 });
  }
  await setTotpSecret(admin.id, null);
  return NextResponse.json({ enabled: false });
}
