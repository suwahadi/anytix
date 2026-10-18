import { NextResponse, type NextRequest } from "next/server";
import { foreignOrigin } from "@/lib/admin-route";
import { ADMIN_COOKIE, cookieOptions } from "@/lib/admin-session";

export async function POST(req: NextRequest) {
  if (foreignOrigin(req)) return NextResponse.json({ error: "Permintaan ditolak." }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", cookieOptions(0));
  return res;
}
