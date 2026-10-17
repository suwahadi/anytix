import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { adminRoute, UserError } from "@/lib/admin-route";
import { ADMIN_COOKIE, createSessionValue } from "@/lib/admin-session";
import { createAdmin } from "@/lib/admin-service";
import { writeAudit } from "@/lib/audit";
import { sql } from "@/lib/db";

let cookie = "";
let adminId = 0;

beforeAll(async () => {
  adminId = await createAdmin(`test-admin-${randomUUID().slice(0, 8)}@example.com`, "rahasia-panjang-123");
  cookie = `${ADMIN_COOKIE}=${createSessionValue(adminId)}`;
});

afterAll(async () => {
  await sql`delete from audit_logs where admin_id in (select id from admins where email like 'test-admin-%')`;
  await sql`delete from admins where email like 'test-admin-%'`;
});

const route = adminRoute(z.object({ name: z.string().min(2, "Nama minimal 2 huruf.") }), async ({ body, params }) =>
  Response.json({ hello: body.name, id: params.id ?? null }),
);

const failing = adminRoute(null, async () => {
  throw new UserError("Tidak bisa", 409, { name: "Sudah dipakai." });
});

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/admin/test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", cookie, ...headers },
  });
}

const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

describe("adminRoute", () => {
  it("401 without session", async () => {
    const res = await route(new NextRequest("http://localhost/x", { method: "POST", body: "{}" }), ctx());
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("422 with field messages", async () => {
    const res = await route(req({ name: "a" }), ctx());
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Periksa kembali isian yang ditandai.",
      fields: { name: "Nama minimal 2 huruf." },
    });
  });

  it("no-store on success and passes params", async () => {
    const res = await route(req({ name: "Budi" }), ctx({ id: "7" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ hello: "Budi", id: "7" });
  });

  it("UserError maps to its status", async () => {
    const res = await failing(req({}), ctx());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Tidak bisa", fields: { name: "Sudah dipakai." } });
  });

  it("foreign key violation is 409", async () => {
    const fk = adminRoute(null, async () => {
      await sql`insert into event_sessions (event_id, starts_at, ends_at) values (-1, now(), now())`;
      return Response.json({});
    });
    const res = await fk(req({}), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Data terkait sudah berubah. Muat ulang halaman lalu coba lagi.");
  });

  it("rejects a foreign origin on writes", async () => {
    const res = await route(req({ name: "Budi" }, { origin: "https://evil.example" }), ctx());
    expect(res.status).toBe(403);
    const same = await route(req({ name: "Budi" }, { origin: "http://localhost:3000" }), ctx());
    expect(same.status).toBe(200);
  });

  it("writeAudit stores a row", async () => {
    await writeAudit(sql, { adminId, action: "update", entity: "event", entityId: 42, diff: { title: ["A", "B"] } });
    const [row] = await sql`select action, entity, entity_id, diff from audit_logs where admin_id = ${adminId}`;
    expect(row).toEqual({ action: "update", entity: "event", entity_id: "42", diff: { title: ["A", "B"] } });
  });
});
