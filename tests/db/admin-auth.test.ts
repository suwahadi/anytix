import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/admin/auth/login/route";
import { POST as verify2fa } from "@/app/api/admin/auth/2fa/route";
import { POST as setup2fa } from "@/app/api/admin/auth/2fa/setup/route";
import { ADMIN_2FA_COOKIE, ADMIN_COOKIE, createSessionValue } from "@/lib/admin-session";
import { createAdmin, getTotpSecret, setTotpSecret } from "@/lib/admin-service";
import { sql } from "@/lib/db";
import { generateTotpSecret, totpCode } from "@/lib/totp";

const PASSWORD = "rahasia-panjang-123";

afterAll(async () => {
  await sql`delete from admins where email like 'test-admin-%'`;
});

async function newAdmin() {
  const email = `test-admin-${randomUUID().slice(0, 8)}@example.com`;
  const id = await createAdmin(email, PASSWORD);
  return { id, email };
}

function post(path: string, body: unknown, cookie?: string) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}`,
      ...(cookie ? { cookie } : {}),
    },
  });
}

function cookieFrom(res: Response, name: string): string | undefined {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  return raw?.split(";")[0];
}

describe("admin auth", () => {
  it("login without 2fa sets session", async () => {
    const { email } = await newAdmin();
    const res = await login(post("/api/admin/auth/login", { email, password: PASSWORD }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ next: "done" });
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith(`${ADMIN_COOKIE}=`));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
  });

  it("accepts email in any case", async () => {
    const { email } = await newAdmin();
    const res = await login(post("/api/admin/auth/login", { email: email.toUpperCase(), password: PASSWORD }));
    expect(res.status).toBe(200);
  });

  it("wrong password", async () => {
    const { email } = await newAdmin();
    const res = await login(post("/api/admin/auth/login", { email, password: "salah-sekali" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Email atau kata sandi salah." });
    expect(cookieFrom(res, ADMIN_COOKIE)).toBeUndefined();
  });

  it("rate limited after 5 attempts", async () => {
    const { email } = await newAdmin();
    const req = () =>
      new NextRequest("http://localhost/api/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password: "salah-sekali" }),
        headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" },
      });
    for (let i = 0; i < 5; i++) expect((await login(req())).status).toBe(401);
    expect((await login(req())).status).toBe(429);
  });

  it("rate limits an email even when the client rotates its IP header", async () => {
    const { email } = await newAdmin();
    for (let i = 0; i < 20; i++) {
      const res = await login(post("/api/admin/auth/login", { email, password: `salah-${i}` }));
      expect(res.status).toBe(401);
    }
    const res = await login(post("/api/admin/auth/login", { email, password: PASSWORD }));
    expect(res.status).toBe(429);
  });

  it("2fa setup does not replace an existing secret", async () => {
    const { id } = await newAdmin();
    const current = generateTotpSecret();
    await setTotpSecret(id, current);
    const attacker = generateTotpSecret();
    const res = await setup2fa(
      post("/api/admin/auth/2fa/setup", { secret: attacker, code: totpCode(attacker, Date.now()) }, `${ADMIN_COOKIE}=${createSessionValue(id)}`),
    );
    expect(res.status).toBe(409);
    expect(await getTotpSecret(id)).toBe(current);
  });

  it("login with 2fa needs code", async () => {
    const { id, email } = await newAdmin();
    const secret = generateTotpSecret();
    await setTotpSecret(id, secret);
    const first = await login(post("/api/admin/auth/login", { email, password: PASSWORD }));
    expect(await first.json()).toEqual({ next: "2fa" });
    expect(cookieFrom(first, ADMIN_COOKIE)).toBeUndefined();
    const pending = cookieFrom(first, ADMIN_2FA_COOKIE)!;
    expect(pending).toBeDefined();

    const wrong = await verify2fa(post("/api/admin/auth/2fa", { code: "000000" }, pending));
    expect(wrong.status).toBe(401);
    const ok = await verify2fa(post("/api/admin/auth/2fa", { code: totpCode(secret, Date.now()) }, pending));
    expect(ok.status).toBe(200);
    expect(cookieFrom(ok, ADMIN_COOKIE)).toBeDefined();
  });

  it("a 2fa code logs in once only", async () => {
    const { id, email } = await newAdmin();
    const secret = generateTotpSecret();
    await setTotpSecret(id, secret);
    const code = totpCode(secret, Date.now());
    const pendingFor = async () => cookieFrom(await login(post("/api/admin/auth/login", { email, password: PASSWORD })), ADMIN_2FA_COOKIE)!;
    expect((await verify2fa(post("/api/admin/auth/2fa", { code }, await pendingFor()))).status).toBe(200);
    const replay = await verify2fa(post("/api/admin/auth/2fa", { code }, await pendingFor()));
    expect(replay.status).toBe(401);
    expect(cookieFrom(replay, ADMIN_COOKIE)).toBeUndefined();
  });

  it("2fa without pending cookie is rejected", async () => {
    const res = await verify2fa(post("/api/admin/auth/2fa", { code: "123456" }));
    expect(res.status).toBe(401);
  });

  it("inactive admin rejected", async () => {
    const { id, email } = await newAdmin();
    await sql`update admins set is_active = false where id = ${id}`;
    const res = await login(post("/api/admin/auth/login", { email, password: PASSWORD }));
    expect(res.status).toBe(401);
  });

  it("rejects short passwords on create", async () => {
    await expect(createAdmin(`test-admin-${randomUUID().slice(0, 8)}@example.com`, "pendek")).rejects.toThrow();
  });
});
