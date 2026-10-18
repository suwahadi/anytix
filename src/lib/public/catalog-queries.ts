import { cacheLife, cacheTag } from "next/cache";
import { sql } from "@/lib/db";
import { PRICE_OPTIONS, type PriceFilter, type SortOrder, type WhenFilter } from "@/lib/public/event-filters";
import { eventTag, TAG_CATEGORIES, TAG_CONTENT, TAG_EVENTS, TAG_SITE } from "@/lib/public-cache";
import { getSettingsGroup, type PagesView, type SiteView } from "@/lib/settings-service";
import { ticketBadge, type TicketBadge } from "@/lib/ticket-status";
import type { Timezone } from "@/lib/validation/catalog";

/** `revalidate` gives `s-maxage=60` (PRD §17); `stale` under 5 minutes would keep this data out of the App Shell, so navigations would block. */
export const PUBLIC_CACHE = { stale: 300, revalidate: 60, expire: 3600 };
export const SEARCH_PAGE_SIZE = 12;

export type PublicEventCard = {
  id: number;
  slug: string;
  title: string;
  posterPath: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: Timezone;
  city: string;
  venue: string;
  organizerName: string;
  organizerLogoPath: string | null;
  minPrice: number | null;
  categorySlug: string;
  categoryName: string;
};

export type PublicTicketCategory = {
  id: number;
  inventoryId: number;
  name: string;
  description: string;
  price: number;
  maxPerOrder: number;
  admitsPerUnit: number;
  hasMerchandise: boolean;
  saleStartsAt: Date;
  saleEndsAt: Date;
  status: string;
  capacity: number;
  sold: number;
  held: number;
  /** Computed when the cache entry was filled; the tickets page refreshes it from the availability endpoint. */
  badge: TicketBadge;
};

export type PublicEvent = PublicEventCard & {
  description: string;
  terms: string;
  refundPolicy: string;
  facilities: string[];
  province: string;
  mapUrl: string | null;
  socialLinks: Record<string, string>;
  seo: { title?: string; description?: string };
  saleStatus: string;
  ticketCategories: PublicTicketCategory[];
};

export type PublicCategory = { id: number; name: string; slug: string; icon: string | null; eventCount: number };

function minPrice() {
  return sql`(select min(tc.price) from ticket_categories tc where tc.event_id = e.id and tc.status = 'active')`;
}

function cardColumns() {
  return sql`
    e.id, e.slug, e.title, e.poster_path as "posterPath", e.starts_at as "startsAt", e.ends_at as "endsAt",
    e.timezone, e.city, e.venue, e.organizer_name as "organizerName", e.organizer_logo_path as "organizerLogoPath",
    ${minPrice()} as "minPrice",
    c.slug as "categorySlug", c.name as "categoryName"`;
}

/** Upper bound on starts_at, so events already running still match. "Hari ini" ends at midnight WIB, the catalogue's home timezone. */
function startsBefore(when: WhenFilter) {
  if (when === "hari-ini") return sql`(date_trunc('day', now() at time zone 'Asia/Jakarta') + interval '1 day') at time zone 'Asia/Jakarta'`;
  return when === "pekan-ini" ? sql`now() + interval '7 days'` : sql`now() + interval '30 days'`;
}

function orderBy(sort: SortOrder) {
  if (sort === "terbaru") return sql`e.created_at desc, e.id desc`;
  if (sort === "termurah") return sql`"minPrice" asc nulls last, e.starts_at, e.id`;
  if (sort === "termahal") return sql`"minPrice" desc nulls last, e.starts_at, e.id`;
  return sql`e.starts_at, e.id`;
}

export async function getPublicCities(): Promise<string[]> {
  "use cache";
  cacheLife(PUBLIC_CACHE);
  cacheTag(TAG_EVENTS);
  const rows = await sql<{ city: string }[]>`
    select distinct e.city from events e
     where e.status = 'published' and e.ends_at > now() and e.city <> ''
     order by e.city`;
  return rows.map((r) => r.city);
}

export async function getPublicCategories(): Promise<PublicCategory[]> {
  "use cache";
  cacheLife(PUBLIC_CACHE);
  cacheTag(TAG_CATEGORIES, TAG_EVENTS);
  return sql<PublicCategory[]>`
    select c.id, c.name, c.slug, c.icon,
           (select count(*) from events e
             where e.event_category_id = c.id and e.status = 'published' and e.ends_at > now()) as "eventCount"
      from event_categories c
     where c.is_active
     order by c.position, c.id`;
}

export async function getHomeEvents(): Promise<{ featured: PublicEventCard[]; bestSellers: PublicEventCard[]; upcoming: PublicEventCard[] }> {
  "use cache";
  cacheLife(PUBLIC_CACHE);
  cacheTag(TAG_EVENTS);
  const [featured, bestSellers, upcoming] = await Promise.all([
    sql<PublicEventCard[]>`
      select ${cardColumns()} from events e join event_categories c on c.id = e.event_category_id
       where e.status = 'published' and e.is_featured and e.ends_at > now()
       order by e.starts_at, e.id limit 6`,
    sql<PublicEventCard[]>`
      select ${cardColumns()} from events e join event_categories c on c.id = e.event_category_id
        join lateral (
          select sum(i.sold) as sold from ticket_inventory i join ticket_categories tc on tc.id = i.ticket_category_id where tc.event_id = e.id
        ) s on true
       where e.status = 'published' and e.ends_at > now() and s.sold > 0
       order by s.sold desc, e.starts_at, e.id limit 6`,
    sql<PublicEventCard[]>`
      select ${cardColumns()} from events e join event_categories c on c.id = e.event_category_id
       where e.status = 'published' and e.ends_at > now()
       order by e.starts_at, e.id limit 8`,
  ]);
  return { featured, bestSellers, upcoming };
}

export async function searchPublicEvents(params: {
  category?: string;
  q?: string;
  city?: string;
  when?: WhenFilter | "";
  price?: PriceFilter | "";
  sort?: SortOrder;
  page: number;
}): Promise<{ items: PublicEventCard[]; total: number; pageSize: typeof SEARCH_PAGE_SIZE }> {
  "use cache";
  cacheLife(PUBLIC_CACHE);
  cacheTag(TAG_EVENTS);
  const q = params.q?.trim();
  const pattern = q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
  const page = Math.min(Math.max(1, Math.floor(params.page) || 1), 10_000);
  const band = PRICE_OPTIONS.find((o) => o.value === params.price);
  const matches = () => sql`
    from events e join event_categories c on c.id = e.event_category_id
   where e.status = 'published' and e.ends_at > now()
     ${params.category ? sql`and c.slug = ${params.category}` : sql``}
     ${params.city ? sql`and e.city = ${params.city}` : sql``}
     ${pattern ? sql`and (e.title ilike ${pattern} or e.city ilike ${pattern} or e.venue ilike ${pattern})` : sql``}
     ${params.when ? sql`and e.starts_at < ${startsBefore(params.when)}` : sql``}
     ${band?.min != null ? sql`and ${minPrice()} >= ${band.min}` : sql``}
     ${band?.max != null ? sql`and ${minPrice()} < ${band.max}` : sql``}`;
  const [items, [{ total }]] = await Promise.all([
    sql<PublicEventCard[]>`
      select ${cardColumns()} ${matches()}
       order by ${orderBy(params.sort ?? "terdekat")}
       limit ${SEARCH_PAGE_SIZE} offset ${(page - 1) * SEARCH_PAGE_SIZE}`,
    sql<{ total: number }[]>`select count(*) as total ${matches()}`,
  ]);
  return { items, total, pageSize: SEARCH_PAGE_SIZE };
}

export async function getPublicEvent(eventId: number): Promise<PublicEvent | null> {
  "use cache";
  cacheLife(PUBLIC_CACHE);
  cacheTag(TAG_EVENTS, eventTag(eventId));
  const [event] = await sql<Omit<PublicEvent, "ticketCategories">[]>`
    select ${cardColumns()}, e.description, e.terms, e.refund_policy as "refundPolicy", e.facilities, e.province,
           e.map_url as "mapUrl", e.social_links as "socialLinks",
           e.seo, e.sale_status as "saleStatus"
      from events e join event_categories c on c.id = e.event_category_id
     where e.id = ${eventId} and e.status = 'published'`;
  if (!event) return null;
  const rows = await sql<Omit<PublicTicketCategory, "badge">[]>`
    select tc.id, i.id as "inventoryId", tc.name, tc.description, tc.price, tc.max_per_order as "maxPerOrder",
           tc.admits_per_unit as "admitsPerUnit", tc.has_merchandise as "hasMerchandise",
           tc.sale_starts_at as "saleStartsAt", tc.sale_ends_at as "saleEndsAt", tc.status,
           i.capacity, i.sold, i.held
      from ticket_categories tc join ticket_inventory i on i.ticket_category_id = tc.id
     where tc.event_id = ${eventId} and tc.status = 'active'
     order by tc.position, tc.id`;
  const now = new Date();
  const ticketCategories = rows.map((c) => ({ ...c, badge: ticketBadge({ ...c, eventSaleStatus: event.saleStatus, eventEndsAt: event.endsAt }, now) }));
  return { ...event, ticketCategories };
}

export async function resolvePublicSlug(slug: string): Promise<{ eventId: number; currentSlug: string; redirected: boolean } | null> {
  "use cache";
  cacheLife(PUBLIC_CACHE);
  cacheTag(TAG_EVENTS);
  const [row] = await sql<{ id: number; slug: string; redirected: boolean }[]>`
    select e.id, e.slug, false as redirected from events e where e.slug = ${slug} and e.status = 'published'
    union all
    select e.id, e.slug, true from slug_redirects r join events e on e.id = r.event_id
     where r.old_slug = ${slug} and e.status = 'published'
    limit 1`;
  return row ? { eventId: row.id, currentSlug: row.slug, redirected: row.redirected } : null;
}

export async function getPublicSite(): Promise<SiteView> {
  "use cache";
  cacheLife(PUBLIC_CACHE);
  cacheTag(TAG_SITE);
  return getSettingsGroup("site");
}

export async function getPublicPages(): Promise<PagesView> {
  "use cache";
  cacheLife(PUBLIC_CACHE);
  cacheTag(TAG_CONTENT);
  return getSettingsGroup("pages");
}

export async function getPublicFaqs(): Promise<Array<{ id: number; question: string; answer: string }>> {
  "use cache";
  cacheLife(PUBLIC_CACHE);
  cacheTag(TAG_CONTENT);
  return sql<Array<{ id: number; question: string; answer: string }>>`
    select id, question, answer from faqs where is_active order by position, id`;
}

export async function getPublishedSlugs(): Promise<string[]> {
  "use cache";
  cacheLife(PUBLIC_CACHE);
  cacheTag(TAG_EVENTS);
  const rows = await sql<{ slug: string }[]>`select slug from events where status = 'published' order by id`;
  return rows.map((r) => r.slug);
}
