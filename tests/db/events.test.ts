import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createRoute } from "@/app/api/admin/events/route";
import { ADMIN_COOKIE, createSessionValue } from "@/lib/admin-session";
import { createAdmin } from "@/lib/admin-service";
import { createEvent, getAdminEvent, resolveSlug, updateEvent } from "@/lib/catalog/event-service";
import { sql } from "@/lib/db";
import { parseEngineError } from "@/lib/db-errors";
import { eventInput } from "@/lib/validation/catalog";
import { cleanupTestEvents } from "./helpers";

let adminId = 0;
let categoryId = 0;

beforeAll(async () => {
  adminId = await createAdmin(`test-admin-${randomUUID().slice(0, 8)}@example.com`, "rahasia-panjang-123");
  [{ id: categoryId }] = await sql<{ id: number }[]>`select id from event_categories order by position limit 1`;
});

afterAll(async () => {
  await cleanupTestEvents();
  await sql`delete from audit_logs where admin_id = ${adminId}`;
  await sql`delete from admins where email like 'test-admin-%'`;
});

const slug = () => `test-${randomUUID().slice(0, 8)}`;

function values(over: Record<string, unknown> = {}) {
  return eventInput.parse({
    title: "Test Konser Jazz",
    slug: slug(),
    eventCategoryId: categoryId,
    description: "<p>Deskripsi</p>",
    facilities: ["parking", "toilet"],
    startsAt: "2026-12-20T19:00:00+07:00",
    endsAt: "2026-12-20T22:00:00+07:00",
    timezone: "Asia/Jakarta",
    venue: "Gedung Kesenian",
    city: "Jakarta Pusat",
    province: "DKI Jakarta",
    organizerName: "Penyelenggara Uji",
    ...over,
  });
}

async function engineCode(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return parseEngineError(e)?.code;
  }
}

describe("events", () => {
  it("create makes a default session with the sale status", async () => {
    const event = await createEvent(adminId, values({ saleStatus: "on_sale" }));
    const [session] = await sql`select status, starts_at, ends_at from event_sessions where event_id = ${event.id}`;
    expect(session.status).toBe("on_sale");
    expect(session.starts_at.toISOString()).toBe("2026-12-20T12:00:00.000Z");
    expect(session.ends_at.toISOString()).toBe("2026-12-20T15:00:00.000Z");
    expect(event.sessionId).toBeGreaterThan(0);
    const tags = (globalThis as { __revalidatedTags?: string[] }).__revalidatedTags ?? [];
    expect(tags).toEqual(expect.arrayContaining(["events", `event-${event.id}`]));
  });

  it("sale status change syncs the session", async () => {
    const event = await createEvent(adminId, values({ status: "published", saleStatus: "on_sale" }));
    const reserve = () =>
      sql`select reserve_tickets(${randomUUID()}::uuid, ${event.id}, '[]'::jsonb, ${randomUUID()})`;
    expect(await engineCode(reserve())).toBe("INVALID_ITEMS");
    await updateEvent(adminId, event.id, values({ slug: event.slug, status: "published", saleStatus: "paused" }));
    const [session] = await sql`select status from event_sessions where event_id = ${event.id}`;
    expect(session.status).toBe("paused");
    expect(await engineCode(reserve())).toBe("NOT_ON_SALE");
  });

  it("slug history round trip", async () => {
    const [a, b, c] = [slug(), slug(), slug()];
    const event = await createEvent(adminId, values({ slug: a }));
    await updateEvent(adminId, event.id, values({ slug: b }));
    await updateEvent(adminId, event.id, values({ slug: c }));
    await updateEvent(adminId, event.id, values({ slug: a }));
    expect(await resolveSlug(a)).toEqual({ eventId: event.id, currentSlug: a, redirected: false });
    expect(await resolveSlug(b)).toEqual({ eventId: event.id, currentSlug: a, redirected: true });
    expect(await resolveSlug(c)).toEqual({ eventId: event.id, currentSlug: a, redirected: true });
    expect(await sql`select 1 from slug_redirects where old_slug = ${a}`).toHaveLength(0);
  });

  it("takes over a slug that is only a redirect", async () => {
    const [x, y] = [slug(), slug()];
    const first = await createEvent(adminId, values({ slug: x }));
    await updateEvent(adminId, first.id, values({ slug: y }));
    const second = await createEvent(adminId, values({ slug: x }));
    expect(await resolveSlug(x)).toEqual({ eventId: second.id, currentSlug: x, redirected: false });
  });

  it("rejects a slug used by another event", async () => {
    const taken = slug();
    await createEvent(adminId, values({ slug: taken }));
    await expect(createEvent(adminId, values({ slug: taken }))).rejects.toMatchObject({
      status: 409,
      fields: { slug: expect.any(String) },
    });
  });

  it("sanitizes rich text on save", async () => {
    const event = await createEvent(adminId, values({ description: "<p>Aman</p><script>alert(1)</script>" }));
    expect((await getAdminEvent(event.id))?.description).toBe("<p>Aman</p>");
  });

  it("rejects endsAt before startsAt", async () => {
    const res = await createRoute(
      new NextRequest("http://localhost/api/admin/events", {
        method: "POST",
        body: JSON.stringify({ ...values(), startsAt: "2026-12-20T22:00:00+07:00", endsAt: "2026-12-20T19:00:00+07:00" }),
        headers: { "content-type": "application/json", cookie: `${ADMIN_COOKIE}=${createSessionValue(adminId)}` },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(422);
    expect((await res.json()).fields.endsAt).toBeDefined();
  });
});
