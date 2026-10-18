import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createRoute } from "@/app/api/admin/event-categories/route";
import { ADMIN_COOKIE, createSessionValue } from "@/lib/admin-session";
import { createAdmin } from "@/lib/admin-service";
import { UserError } from "@/lib/admin-route";
import {
  createEventCategory,
  listEventCategories,
  removeEventCategory,
  reorderEventCategories,
  updateEventCategory,
} from "@/lib/catalog/event-category-service";
import { sql } from "@/lib/db";
import { cleanupTestEvents } from "./helpers";

let adminId = 0;
let originalOrder: number[] = [];

beforeAll(async () => {
  adminId = await createAdmin(`test-admin-${randomUUID().slice(0, 8)}@example.com`, "rahasia-panjang-123");
  originalOrder = (await listEventCategories()).map((c) => c.id);
});

afterAll(async () => {
  await cleanupTestEvents();
  await sql`delete from event_categories where slug like 'test-cat-%'`;
  const ids = (await listEventCategories()).map((c) => c.id);
  const restored = [...originalOrder.filter((id) => ids.includes(id)), ...ids.filter((id) => !originalOrder.includes(id))];
  await reorderEventCategories(adminId, restored);
  await sql`delete from audit_logs where admin_id = ${adminId}`;
  await sql`delete from admins where id = ${adminId}`;
});

async function userError(p: Promise<unknown>): Promise<UserError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof UserError) return e;
    throw e;
  }
  throw new Error("expected UserError");
}

const unique = () => randomUUID().slice(0, 6);

describe("event categories", () => {
  it("creates with slug from name at the last position", async () => {
    const tag = unique();
    const cat = await createEventCategory(adminId, { name: `Test Cat Seni Rupa ${tag}`, isActive: true });
    expect(cat.slug).toBe(`test-cat-seni-rupa-${tag}`);
    const all = await listEventCategories();
    expect(all.at(-1)?.id).toBe(cat.id);
    const [audit] = await sql`select action, entity from audit_logs where admin_id = ${adminId} and entity_id = ${String(cat.id)}`;
    expect(audit).toEqual({ action: "create", entity: "event_category" });
    const tags = (globalThis as { __revalidatedTags?: string[] }).__revalidatedTags ?? [];
    expect(tags).toEqual(expect.arrayContaining(["categories", "events"]));
  });

  it("rejects duplicate slug", async () => {
    const slug = `test-cat-dup-${unique()}`;
    await createEventCategory(adminId, { name: "Test Cat Dup", slug, isActive: true });
    const err = await userError(createEventCategory(adminId, { name: "Test Cat Dup 2", slug, isActive: true }));
    expect(err.status).toBe(409);
    expect(err.fields?.slug).toBeDefined();
  });

  it("updates name, slug and visibility", async () => {
    const cat = await createEventCategory(adminId, { name: `Test Cat Ubah ${unique()}`, isActive: true });
    const updated = await updateEventCategory(adminId, cat.id, {
      name: "Test Cat Sudah Diubah",
      slug: `test-cat-diubah-${unique()}`,
      isActive: false,
    });
    expect(updated.name).toBe("Test Cat Sudah Diubah");
    expect(updated.isActive).toBe(false);
  });

  it("reorder sets positions in given order", async () => {
    const ids = (await listEventCategories()).map((c) => c.id);
    const reversed = [...ids].reverse();
    await reorderEventCategories(adminId, reversed);
    expect((await listEventCategories()).map((c) => c.id)).toEqual(reversed);
    const err = await userError(reorderEventCategories(adminId, reversed.slice(1)));
    expect(err.status).toBe(422);
  });

  it("refuses delete when used", async () => {
    const used = await createEventCategory(adminId, { name: `Test Cat Dipakai ${unique()}`, isActive: true });
    await sql`
      insert into events (event_category_id, title, slug, starts_at, ends_at)
      values (${used.id}, 'Test event kategori', ${`test-${unique()}`}, now(), now() + interval '1 hour')`;
    const err = await userError(removeEventCategory(adminId, used.id));
    expect(err.status).toBe(409);
    expect(err.message).toContain("Sembunyikan");

    const unused = await createEventCategory(adminId, { name: `Test Cat Kosong ${unique()}`, isActive: true });
    await removeEventCategory(adminId, unused.id);
    expect((await listEventCategories()).some((c) => c.id === unused.id)).toBe(false);
  });

  it("route validates input", async () => {
    const res = await createRoute(
      new NextRequest("http://localhost/api/admin/event-categories", {
        method: "POST",
        body: JSON.stringify({ name: "a" }),
        headers: { "content-type": "application/json", cookie: `${ADMIN_COOKIE}=${createSessionValue(adminId)}` },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(422);
    expect((await res.json()).fields.name).toBeDefined();
  });
});
