import { UserError } from "@/lib/admin-route";
import { diffFields, writeAudit } from "@/lib/audit";
import { sql, transaction } from "@/lib/db";
import { isCheckViolation } from "@/lib/db-errors";
import { eventTag, invalidatePublic, TAG_EVENTS } from "@/lib/public-cache";
import { sanitizeRichText } from "@/lib/rich-text";
import type { TicketCategoryValues } from "@/lib/validation/catalog";

export type AdminTicketCategory = {
  id: number;
  name: string;
  description: string;
  price: number;
  capacity: number;
  sold: number;
  held: number;
  available: number;
  saleStartsAt: Date;
  saleEndsAt: Date;
  maxPerOrder: number;
  admitsPerUnit: number;
  hasMerchandise: boolean;
  status: string;
  position: number;
  inventoryId: number;
  everReserved: boolean;
};

export async function listTicketCategories(eventId: number, categoryId?: number): Promise<AdminTicketCategory[]> {
  const only = categoryId ?? null;
  return sql<AdminTicketCategory[]>`
    select c.id, c.name, c.description, c.price, i.capacity, i.sold, i.held, i.capacity - i.sold - i.held as available,
           c.sale_starts_at as "saleStartsAt", c.sale_ends_at as "saleEndsAt", c.max_per_order as "maxPerOrder",
           c.admits_per_unit as "admitsPerUnit", c.has_merchandise as "hasMerchandise", c.status, c.position,
           i.id as "inventoryId",
           exists (select 1 from hold_items hi where hi.inventory_id = i.id) as "everReserved"
      from ticket_categories c join ticket_inventory i on i.ticket_category_id = c.id
     where c.event_id = ${eventId} and (${only}::bigint is null or c.id = ${only})
     order by c.position, c.id`;
}

async function getOwned(eventId: number, categoryId: number): Promise<AdminTicketCategory> {
  const [row] = await listTicketCategories(eventId, categoryId);
  if (!row) throw new UserError("Kategori tiket tidak ditemukan.", 404);
  return row;
}

function columns(input: TicketCategoryValues) {
  return {
    name: input.name,
    description: sanitizeRichText(input.description),
    price: input.price,
    sale_starts_at: new Date(input.saleStartsAt),
    sale_ends_at: new Date(input.saleEndsAt),
    max_per_order: input.maxPerOrder,
    admits_per_unit: input.admitsPerUnit,
    has_merchandise: input.hasMerchandise,
    status: input.status,
  };
}

function auditable(c: AdminTicketCategory | TicketCategoryValues) {
  return {
    name: c.name,
    price: c.price,
    capacity: c.capacity,
    saleStartsAt: new Date(c.saleStartsAt).toISOString(),
    saleEndsAt: new Date(c.saleEndsAt).toISOString(),
    maxPerOrder: c.maxPerOrder,
    admitsPerUnit: c.admitsPerUnit,
    hasMerchandise: c.hasMerchandise,
    status: c.status,
  };
}

function changed(eventId: number) {
  invalidatePublic(TAG_EVENTS, eventTag(eventId));
}

export async function createTicketCategory(
  adminId: number,
  eventId: number,
  input: TicketCategoryValues,
): Promise<AdminTicketCategory> {
  const [session] = await sql<{ id: number | null }[]>`select min(id) as id from event_sessions where event_id = ${eventId}`;
  if (!session?.id) throw new UserError("Event tidak ditemukan.", 404);
  const sessionId = session.id;
  const c = columns(input);
  const id = await transaction(async (tx) => {
    const [{ id }] = await tx<{ id: number }[]>`
      insert into ticket_categories (event_id, name, description, price, sale_starts_at, sale_ends_at, max_per_order,
                                     admits_per_unit, has_merchandise, status, position)
      values (${eventId}, ${c.name}, ${c.description}, ${c.price}, ${c.sale_starts_at}, ${c.sale_ends_at},
              ${c.max_per_order}, ${c.admits_per_unit}, ${c.has_merchandise}, ${c.status},
              (select coalesce(max(position), 0) + 1 from ticket_categories where event_id = ${eventId}))
      returning id`;
    await tx`insert into ticket_inventory (session_id, ticket_category_id, capacity) values (${sessionId}, ${id}, ${input.capacity})`;
    await writeAudit(tx, { adminId, action: "create", entity: "ticket_category", entityId: id, diff: auditable(input) });
    return id;
  });
  changed(eventId);
  return getOwned(eventId, id);
}

export async function updateTicketCategory(
  adminId: number,
  eventId: number,
  categoryId: number,
  input: TicketCategoryValues,
): Promise<AdminTicketCategory> {
  const before = await getOwned(eventId, categoryId);
  try {
    await transaction(async (tx) => {
      if (input.admitsPerUnit !== before.admitsPerUnit) {
        // Locking the inventory row first (engine lock order) makes a concurrent reserve wait for this check.
        await tx`select 1 from ticket_inventory where id = ${before.inventoryId} for update`;
        const [used] = await tx`select 1 from hold_items where inventory_id = ${before.inventoryId} limit 1`;
        if (used) {
          const message = "Jumlah orang per tiket tidak bisa diubah karena kategori ini sudah pernah dipesan.";
          throw new UserError(message, 409, { admitsPerUnit: message });
        }
      }
      await tx`update ticket_categories set ${tx(columns(input) as Record<string, unknown>)} where id = ${categoryId}`;
      await tx`update ticket_inventory set capacity = ${input.capacity} where id = ${before.inventoryId}`;
      await writeAudit(tx, {
        adminId,
        action: "update",
        entity: "ticket_category",
        entityId: categoryId,
        diff: diffFields(auditable(before), auditable(input)),
      });
    });
  } catch (e) {
    if (!isCheckViolation(e) || (e as { table_name?: string }).table_name !== "ticket_inventory") throw e;
    const [{ used }] = await sql<{ used: number }[]>`
      select sold + held as used from ticket_inventory where id = ${before.inventoryId}`;
    const message = `Kuota minimal ${used} (terjual + sedang dipesan).`;
    throw new UserError(message, 409, { capacity: message });
  }
  changed(eventId);
  return getOwned(eventId, categoryId);
}

export async function reorderTicketCategories(adminId: number, eventId: number, ids: number[]): Promise<void> {
  const current = (await sql<{ id: number }[]>`select id from ticket_categories where event_id = ${eventId}`).map((r) => r.id);
  const complete = ids.length === current.length && new Set(ids).size === ids.length && ids.every((id) => current.includes(id));
  if (!complete) throw new UserError("Urutan tidak lengkap. Muat ulang halaman lalu coba lagi.", 422);
  await sql`
    update ticket_categories c set position = v.pos
      from unnest(${ids}::bigint[]) with ordinality as v(id, pos)
     where c.id = v.id and c.event_id = ${eventId}`;
  await writeAudit(sql, { adminId, action: "reorder", entity: "ticket_category", entityId: eventId, diff: { ids } });
  changed(eventId);
}

export async function removeTicketCategory(adminId: number, eventId: number, categoryId: number): Promise<void> {
  const category = await getOwned(eventId, categoryId);
  if (category.everReserved) {
    throw new UserError("Kategori tiket ini sudah pernah dipesan. Sembunyikan saja.", 409);
  }
  await transaction(async (tx) => {
    await tx`delete from ticket_inventory where id = ${category.inventoryId}`;
    await tx`delete from ticket_categories where id = ${categoryId}`;
    await writeAudit(tx, { adminId, action: "delete", entity: "ticket_category", entityId: categoryId, diff: auditable(category) });
  });
  changed(eventId);
}
