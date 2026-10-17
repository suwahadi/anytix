import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { GET as availabilityRoute } from "@/app/api/events/[slug]/availability/route";
import { sql } from "@/lib/db";
import { reserveTickets } from "@/lib/hold-service";
import { getHomeEvents, getPublicEvent, getPublishedSlugs, resolvePublicSlug, searchPublicEvents } from "@/lib/public/catalog-queries";
import { cleanupTestEvents, createTestEvent } from "./helpers";

afterAll(async () => {
  await cleanupTestEvents();
});

async function slugOf(eventId: number) {
  const [row] = await sql<{ slug: string }[]>`select slug from events where id = ${eventId}`;
  return row.slug;
}

describe("public catalog queries", () => {
  it("draft event is not public", async () => {
    for (const status of ["draft", "archived"]) {
      const { eventId } = await createTestEvent();
      const slug = await slugOf(eventId);
      expect(await getPublicEvent(eventId)).not.toBeNull();
      await sql`update events set status = ${status} where id = ${eventId}`;
      expect(await getPublicEvent(eventId)).toBeNull();
      expect(await resolvePublicSlug(slug)).toBeNull();
      expect(await getPublishedSlugs()).not.toContain(slug);
    }
  });

  it("old slug resolves with redirected flag", async () => {
    const { eventId } = await createTestEvent();
    const slug = await slugOf(eventId);
    const old = `test-old-${randomUUID().slice(0, 8)}`;
    await sql`insert into slug_redirects (old_slug, event_id) values (${old}, ${eventId})`;
    expect(await resolvePublicSlug(slug)).toEqual({ eventId, currentSlug: slug, redirected: false });
    expect(await resolvePublicSlug(old)).toEqual({ eventId, currentSlug: slug, redirected: true });
    await sql`delete from slug_redirects where old_slug = ${old}`;
  });

  it("min price ignores hidden categories", async () => {
    const { eventId, categoryIds } = await createTestEvent({
      categories: [
        { price: 100000, capacity: 10 },
        { price: 50000, capacity: 10 },
        { price: 75000, capacity: 10 },
      ],
    });
    await sql`update ticket_categories set status = 'hidden' where id = ${categoryIds[1]}`;
    await sql`update ticket_categories set status = 'draft' where id = ${categoryIds[2]}`;
    const event = await getPublicEvent(eventId);
    expect(event?.minPrice).toBe(100000);
    expect(event?.ticketCategories.map((c) => c.id)).toEqual([categoryIds[0]]);
    await sql`update ticket_categories set status = 'hidden' where id = ${categoryIds[0]}`;
    expect((await getPublicEvent(eventId))?.minPrice).toBeNull();
  });

  it("search filters by category and text", async () => {
    const token = `zq${randomUUID().slice(0, 6)}`;
    const { eventId } = await createTestEvent();
    await sql`update events set city = ${`Kota ${token.toUpperCase()}`} where id = ${eventId}`;
    const [cat] = await sql<{ slug: string }[]>`
      select c.slug from event_categories c join events e on e.event_category_id = c.id where e.id = ${eventId}`;
    const [other] = await sql<{ slug: string }[]>`select slug from event_categories where slug <> ${cat.slug} limit 1`;

    const hit = await searchPublicEvents({ q: token, page: 1 });
    expect(hit.items.map((e) => e.id)).toEqual([eventId]);
    expect(hit).toMatchObject({ total: 1, pageSize: 12 });
    expect((await searchPublicEvents({ q: token, category: cat.slug, page: 1 })).total).toBe(1);
    expect((await searchPublicEvents({ q: token, category: other.slug, page: 1 })).total).toBe(0);
    expect((await searchPublicEvents({ q: "%", page: 1 })).items.every((e) => e.title.includes("%") || e.city.includes("%") || e.venue.includes("%"))).toBe(true);
  });

  it("ended events are excluded from search and upcoming", async () => {
    const token = `zq${randomUUID().slice(0, 6)}`;
    const { eventId } = await createTestEvent();
    await sql`
      update events set title = ${`Ended ${token}`}, is_featured = true,
             starts_at = now() - interval '3 days', ends_at = now() - interval '2 days'
       where id = ${eventId}`;
    expect((await searchPublicEvents({ q: token, page: 1 })).total).toBe(0);
    const home = await getHomeEvents();
    expect([...home.featured, ...home.upcoming].map((e) => e.id)).not.toContain(eventId);
  });

  it("availability reflects held tickets", async () => {
    const { eventId, inventoryIds, categoryIds } = await createTestEvent({ categories: [{ capacity: 50, maxPerOrder: 50 }] });
    await reserveTickets({ visitorId: randomUUID(), eventId, items: [{ inventoryId: inventoryIds[0], qty: 47 }], idempotencyKey: randomUUID() });
    const slug = await slugOf(eventId);
    const res = await availabilityRoute(new NextRequest(`http://localhost/api/events/${slug}/availability`), {
      params: Promise.resolve({ slug }),
    });
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=3, stale-while-revalidate=2");
    expect(await res.json()).toEqual({
      categories: [
        { id: categoryIds[0], inventoryId: inventoryIds[0], badge: { label: "Hampir habis", tone: "warning", buyable: true, remaining: 3 } },
      ],
    });
  });

  it("availability is 404 for a draft event", async () => {
    const { eventId } = await createTestEvent();
    await sql`update events set status = 'draft' where id = ${eventId}`;
    const slug = await slugOf(eventId);
    const res = await availabilityRoute(new NextRequest(`http://localhost/api/events/${slug}/availability`), {
      params: Promise.resolve({ slug }),
    });
    expect(res.status).toBe(404);
  });
});
