import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, cookieOptions, readSessionValue } from "@/lib/admin-session";
import { VISITOR_COOKIE, VISITOR_MAX_AGE_SEC, newVisitorCookie, readVisitorId } from "@/lib/visitor";

const OPEN_ADMIN_API = new Set(["/api/admin/auth/login", "/api/admin/auth/2fa", "/api/admin/auth/logout"]);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const signedIn = readSessionValue(req.cookies.get(ADMIN_COOKIE)?.value) !== null;

  if (pathname.startsWith("/api/admin/")) {
    if (!signedIn && !OPEN_ADMIN_API.has(pathname)) {
      return NextResponse.json({ error: "Sesi berakhir. Silakan masuk lagi." }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!signedIn && pathname !== "/admin/login") {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (readVisitorId(req.cookies.get(VISITOR_COOKIE)?.value)) return NextResponse.next();
  const { value } = newVisitorCookie();
  req.cookies.set(VISITOR_COOKIE, value);
  const res = NextResponse.next({ request: { headers: req.headers } });
  res.cookies.set(VISITOR_COOKIE, value, cookieOptions(VISITOR_MAX_AGE_SEC));
  return res;
}

// Visitor cookies are issued only on uncached routes so a CDN never stores a Set-Cookie.
export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/holds/:path*",
    "/checkout/:path*",
    "/orders/:path*",
    "/api/orders/:path*",
  ],
};
