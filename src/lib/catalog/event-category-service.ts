import { UserError } from "@/lib/admin-route";
import { diffFields, writeAudit } from "@/lib/audit";
import { sql } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db-errors";
import { discardReplacedMedia } from "@/lib/media-cleanup";
import { invalidatePublic, TAG_CATEGORIES, TAG_EVENTS } from "@/lib/public-cache";
import { slugify } from "@/lib/slug";
import type { EventCategoryValues } from "@/lib/validation/catalog";

export type EventCategory = {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  position: number;
  isActive: boolean;
  eventCount: number;
};

const DUPLICATE_SLUG = "Slug sudah dipakai kategori lain.";

export async function listEventCategories(): Promise<EventCategory[]> {
  return sql<EventCategory[]>`
    select c.id, c.name, c.slug, c.icon, c.position, c.is_active as "isActive",
           (select count(*) from events e where e.event_category_id = c.id)::int8 as "eventCount"
      from event_categories c
     order by c.position, c.id`;
}

async function getEventCategory(id: number): Promise<EventCategory> {
  const [row] = await sql<EventCategory[]>`
    select c.id, c.name, c.slug, c.icon, c.position, c.is_active as "isActive",
           (select count(*) from events e where e.event_category_id = c.id)::int8 as "eventCount"
      from event_categories c where c.id = ${id}`;
  if (!row) throw new UserError("Kategori tidak ditemukan.", 404);
  return row;
}

function changed() {
  invalidatePublic(TAG_CATEGORIES, TAG_EVENTS);
}

export async function createEventCategory(adminId: number, input: EventCategoryValues): Promise<EventCategory> {
  const slug = input.slug ?? slugify(input.name);
  let id: number;
  try {
    [{ id }] = await sql<{ id: number }[]>`
      insert into event_categories (name, slug, icon, is_active, position)
      values (${input.name}, ${slug}, ${input.icon ?? null}, ${input.isActive},
              (select coalesce(max(position), 0) + 1 from event_categories))
      returning id`;
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError(DUPLICATE_SLUG, 409, { slug: DUPLICATE_SLUG });
    throw e;
  }
  await writeAudit(sql, { adminId, action: "create", entity: "event_category", entityId: id, diff: { ...input, slug } });
  changed();
  return getEventCategory(id);
}

export async function updateEventCategory(
  adminId: number,
  id: number,
  input: EventCategoryValues,
): Promise<EventCategory> {
  const before = await getEventCategory(id);
  const after = { name: input.name, slug: input.slug ?? before.slug, icon: input.icon ?? null, isActive: input.isActive };
  try {
    await sql`
      update event_categories
         set name = ${after.name}, slug = ${after.slug}, icon = ${after.icon}, is_active = ${after.isActive}
       where id = ${id}`;
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError(DUPLICATE_SLUG, 409, { slug: DUPLICATE_SLUG });
    throw e;
  }
  await writeAudit(sql, {
    adminId,
    action: "update",
    entity: "event_category",
    entityId: id,
    diff: diffFields(before, after),
  });
  changed();
  await discardReplacedMedia([before.icon], [after.icon]);
  return getEventCategory(id);
}

export async function reorderEventCategories(adminId: number, ids: number[]): Promise<void> {
  const current = (await sql<{ id: number }[]>`select id from event_categories`).map((r) => r.id);
  const complete = ids.length === current.length && new Set(ids).size === ids.length && ids.every((id) => current.includes(id));
  if (!complete) throw new UserError("Urutan tidak lengkap. Muat ulang halaman lalu coba lagi.", 422);
  await sql`
    update event_categories c set position = v.pos
      from unnest(${ids}::bigint[]) with ordinality as v(id, pos)
     where c.id = v.id`;
  await writeAudit(sql, { adminId, action: "reorder", entity: "event_category", entityId: "all", diff: { ids } });
  changed();
}

export async function removeEventCategory(adminId: number, id: number): Promise<void> {
  const category = await getEventCategory(id);
  if (category.eventCount > 0) {
    throw new UserError(`Kategori masih dipakai ${category.eventCount} event. Sembunyikan saja.`, 409);
  }
  await sql`delete from event_categories where id = ${id}`;
  await writeAudit(sql, { adminId, action: "delete", entity: "event_category", entityId: id, diff: category });
  changed();
  await discardReplacedMedia([category.icon], []);
}
