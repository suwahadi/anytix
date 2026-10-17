import { NextResponse } from "next/server";
import { ADMIN_COOKIE, cookieOptions } from "@/lib/admin-session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", cookieOptions(0));
  return res;
}
