import { UserError } from "@/lib/admin-route";
import { diffFields, writeAudit } from "@/lib/audit";
import { sql, transaction, type Sql } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db-errors";
import { discardReplacedMedia } from "@/lib/media-cleanup";
import { eventTag, invalidatePublic, TAG_EVENTS } from "@/lib/public-cache";
import { sanitizeRichText } from "@/lib/rich-text";
import { slugify } from "@/lib/slug";
import type { EventValues } from "@/lib/validation/catalog";

export type AdminEvent = {
  id: number;
  eventCategoryId: number;
  title: string;
  slug: string;
  description: string;
  terms: string;
  refundPolicy: string;
  facilities: string[];
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  venue: string;
  city: string;
  province: string;
  mapUrl: string | null;
  organizerName: string;
  organizerLogoPath: string | null;
  posterPath: string | null;
  socialLinks: Record<string, string>;
  status: string;
  saleStatus: string;
  isFeatured: boolean;
  seo: { title?: string; description?: string };
  sessionId: number;
  ticketCategoryCount: number;
};

export type AdminEventRow = Pick<
  AdminEvent,
  "id" | "title" | "slug" | "startsAt" | "endsAt" | "timezone" | "status" | "saleStatus" | "ticketCategoryCount"
> & { categoryName: string; posterPath: string | null };

const DUPLICATE_SLUG = "Slug sudah dipakai event lain.";

export async function getAdminEvent(id: number): Promise<AdminEvent | null> {
  const [row] = await sql<AdminEvent[]>`
    select e.id, e.event_category_id as "eventCategoryId", e.title, e.slug, e.description, e.terms,
           e.refund_policy as "refundPolicy", e.facilities, e.starts_at as "startsAt", e.ends_at as "endsAt",
           e.timezone, e.venue, e.city, e.province, e.map_url as "mapUrl", e.organizer_name as "organizerName",
           e.organizer_logo_path as "organizerLogoPath", e.poster_path as "posterPath",
           e.social_links as "socialLinks", e.status, e.sale_status as "saleStatus", e.is_featured as "isFeatured",
           e.seo,
           (select min(s.id) from event_sessions s where s.event_id = e.id) as "sessionId",
           (select count(*) from ticket_categories c where c.event_id = e.id)::int8 as "ticketCategoryCount"
      from events e where e.id = ${id}`;
  return row ?? null;
}

export async function listAdminEvents(filter: { q?: string; status?: string } = {}): Promise<AdminEventRow[]> {
  const q = filter.q?.trim() ? `%${filter.q.trim()}%` : null;
  const status = filter.status || null;
  return sql<AdminEventRow[]>`
    select e.id, e.title, e.slug, e.starts_at as "startsAt", e.ends_at as "endsAt", e.timezone, e.status,
           e.sale_status as "saleStatus", e.poster_path as "posterPath", ec.name as "categoryName",
           (select count(*) from ticket_categories c where c.event_id = e.id)::int8 as "ticketCategoryCount"
      from events e join event_categories ec on ec.id = e.event_category_id
     where (${q}::text is null or e.title ilike ${q} or e.city ilike ${q} or e.slug ilike ${q})
       and (${status}::text is null or e.status = ${status})
     order by e.starts_at desc, e.id desc`;
}

function columns(input: EventValues, slug: string) {
  return {
    event_category_id: input.eventCategoryId,
    title: input.title,
    slug,
    description: sanitizeRichText(input.description),
    terms: sanitizeRichText(input.terms),
    refund_policy: input.refundPolicy,
    facilities: input.facilities,
    starts_at: new Date(input.startsAt),
    ends_at: new Date(input.endsAt),
    timezone: input.timezone,
    venue: input.venue,
    city: input.city,
    province: input.province,
    map_url: input.mapUrl ?? null,
    organizer_name: input.organizerName,
    organizer_logo_path: input.organizerLogoPath ?? null,
    poster_path: input.posterPath ?? null,
    social_links: input.socialLinks,
    status: input.status,
    sale_status: input.saleStatus,
    is_featured: input.isFeatured,
    seo: input.seo,
  };
}

async function claimSlug(tx: Sql, slug: string, eventId: number | null) {
  const [taken] = await tx<{ id: number }[]>`
    select id from events where slug = ${slug} and (${eventId}::bigint is null or id <> ${eventId})`;
  if (taken) throw new UserError(DUPLICATE_SLUG, 409, { slug: DUPLICATE_SLUG });
  await tx`delete from slug_redirects where old_slug = ${slug}`;
}

function mapDuplicate(e: unknown): never {
  if (isUniqueViolation(e)) throw new UserError(DUPLICATE_SLUG, 409, { slug: DUPLICATE_SLUG });
  throw e;
}

export async function createEvent(adminId: number, input: EventValues): Promise<AdminEvent> {
  const slug = input.slug ?? slugify(input.title);
  const data = columns(input, slug);
  const id = await transaction(async (tx) => {
    await claimSlug(tx, slug, null);
    const [{ id }] = await tx<{ id: number }[]>`
      insert into events ${tx(data as Record<string, unknown>)} returning id`;
    await tx`
      insert into event_sessions (event_id, starts_at, ends_at, status)
      values (${id}, ${data.starts_at}, ${data.ends_at}, ${data.sale_status})`;
    await writeAudit(tx, { adminId, action: "create", entity: "event", entityId: id, diff: { title: input.title, slug } });
    return id;
  }).catch(mapDuplicate);
  invalidatePublic(TAG_EVENTS, eventTag(id));
  return (await getAdminEvent(id))!;
}

function comparable(e: AdminEvent | EventValues, slug: string) {
  return {
    title: e.title,
    slug,
    eventCategoryId: e.eventCategoryId,
    startsAt: new Date(e.startsAt).toISOString(),
    endsAt: new Date(e.endsAt).toISOString(),
    timezone: e.timezone,
    venue: e.venue,
    city: e.city,
    status: e.status,
    saleStatus: e.saleStatus,
    isFeatured: e.isFeatured,
    posterPath: e.posterPath ?? null,
    facilities: e.facilities,
  };
}

export async function updateEvent(adminId: number, id: number, input: EventValues): Promise<AdminEvent> {
  const before = await getAdminEvent(id);
  if (!before) throw new UserError("Event tidak ditemukan.", 404);
  const slug = input.slug ?? before.slug;
  const data = columns(input, slug);
  await transaction(async (tx) => {
    await claimSlug(tx, slug, id);
    if (slug !== before.slug) {
      await tx`
        insert into slug_redirects (old_slug, event_id) values (${before.slug}, ${id})
        on conflict (old_slug) do update set event_id = excluded.event_id`;
    }
    await tx`update events set ${tx(data as Record<string, unknown>)}, updated_at = now() where id = ${id}`;
    await tx`
      update event_sessions set starts_at = ${data.starts_at}, ends_at = ${data.ends_at}, status = ${data.sale_status}
       where event_id = ${id}`;
    await writeAudit(tx, {
      adminId,
      action: "update",
      entity: "event",
      entityId: id,
      diff: diffFields(comparable(before, before.slug), comparable(input, slug)),
    });
  }).catch(mapDuplicate);
  invalidatePublic(TAG_EVENTS, eventTag(id));
  await discardReplacedMedia([before.posterPath, before.organizerLogoPath], [data.poster_path, data.organizer_logo_path]);
  return (await getAdminEvent(id))!;
}

export async function resolveSlug(
  slug: string,
): Promise<{ eventId: number; currentSlug: string; redirected: boolean } | null> {
  const [direct] = await sql<{ id: number; slug: string }[]>`select id, slug from events where slug = ${slug}`;
  if (direct) return { eventId: direct.id, currentSlug: direct.slug, redirected: false };
  const [moved] = await sql<{ id: number; slug: string }[]>`
    select e.id, e.slug from slug_redirects r join events e on e.id = r.event_id where r.old_slug = ${slug}`;
  return moved ? { eventId: moved.id, currentSlug: moved.slug, redirected: true } : null;
}
