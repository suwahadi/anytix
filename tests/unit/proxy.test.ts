import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { ADMIN_COOKIE, createSessionValue } from "@/lib/admin-session";
import { VISITOR_COOKIE, newVisitorCookie } from "@/lib/visitor";
import { proxy } from "@/proxy";

const req = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost${path}`, { headers: cookie ? { cookie } : {} });

describe("proxy", () => {
  it("redirects admin pages without a session to login", () => {
    const res = proxy(req("/admin"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/admin/login");
    expect(proxy(req("/admin/security")).status).toBe(307);
  });

  it("lets the login page and signed-in admins through", () => {
    expect(proxy(req("/admin/login")).headers.get("x-middleware-next")).toBe("1");
    const session = `${ADMIN_COOKIE}=${createSessionValue(1)}`;
    expect(proxy(req("/admin", session)).headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects admin API calls without a session", async () => {
    const res = proxy(req("/api/admin/uploads"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sesi berakhir. Silakan masuk lagi." });
    expect(proxy(req("/api/admin/auth/2fa/setup")).status).toBe(401);
    expect(proxy(req("/api/admin/auth/login")).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(req("/api/admin/auth/2fa")).headers.get("x-middleware-next")).toBe("1");
  });

  it("issues a visitor cookie on booking routes and forwards it to the handler", () => {
    const res = proxy(req("/api/holds"));
    const set = res.headers.getSetCookie().find((c) => c.startsWith(`${VISITOR_COOKIE}=`));
    expect(set).toMatch(/HttpOnly/i);
    const value = set!.split(";")[0].slice(VISITOR_COOKIE.length + 1);
    expect(res.headers.get("x-middleware-request-cookie")).toContain(value);
  });

  it("keeps a valid visitor cookie", () => {
    const { value } = newVisitorCookie();
    const res = proxy(req("/checkout/abc", `${VISITOR_COOKIE}=${value}`));
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});
