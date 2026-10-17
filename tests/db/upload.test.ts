import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as upload } from "@/app/api/admin/uploads/route";
import { ADMIN_COOKIE, createSessionValue } from "@/lib/admin-session";
import { createAdmin } from "@/lib/admin-service";
import { sql } from "@/lib/db";
import { deleteObjects } from "@/lib/storage";

let cookie = "";
const uploaded: string[] = [];
const hasStorageKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

beforeAll(async () => {
  const id = await createAdmin(`test-admin-${randomUUID().slice(0, 8)}@example.com`, "rahasia-panjang-123");
  cookie = `${ADMIN_COOKIE}=${createSessionValue(id)}`;
});

afterAll(async () => {
  if (uploaded.length) await deleteObjects(uploaded);
  await sql`delete from admins where email like 'test-admin-%'`;
});

function request(file: Blob | null, opts: { kind?: string; withCookie?: boolean } = {}) {
  const form = new FormData();
  if (file) form.set("file", file, "poster.png");
  form.set("kind", opts.kind ?? "poster");
  return new NextRequest("http://localhost/api/admin/uploads", {
    method: "POST",
    body: form,
    headers: opts.withCookie === false ? {} : { cookie },
  });
}

const png = async () =>
  new Blob([
    new Uint8Array(
      await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 10, g: 120, b: 90 } } })
        .png()
        .toBuffer(),
    ),
  ]);

describe("POST /api/admin/uploads", () => {
  it.skipIf(!hasStorageKey)("uploads three webp variants", async () => {
    const res = await upload(request(await png()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.base).toMatch(/^poster\/\d{4}\/[A-Za-z0-9_-]{12}$/);
    for (const size of ["lg", "md", "thumb"]) uploaded.push(`${body.base}-${size}.webp`);
    const thumb = await fetch(body.urls.thumb);
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get("content-type")).toBe("image/webp");
    expect(thumb.headers.get("cache-control")).toContain("max-age=31536000");
  });

  it("rejects big file", async () => {
    const res = await upload(request(new Blob([new Uint8Array(11 * 1024 * 1024)])));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Ukuran file maksimal 10 MB." });
  });

  it("rejects non-image", async () => {
    const res = await upload(request(new Blob(["<svg xmlns='http://www.w3.org/2000/svg'/>"])));
    expect(res.status).toBe(415);
  });

  it("rejects unknown kind and missing file", async () => {
    expect((await upload(request(await png(), { kind: "avatar" }))).status).toBe(400);
    expect((await upload(request(null))).status).toBe(400);
  });

  it("requires admin", async () => {
    const res = await upload(request(await png(), { withCookie: false }));
    expect(res.status).toBe(401);
  });
});
