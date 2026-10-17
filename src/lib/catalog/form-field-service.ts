import { UserError } from "@/lib/admin-route";
import { diffFields, writeAudit } from "@/lib/audit";
import { sql } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db-errors";
import { fieldKeyFromLabel, type FormFieldDef } from "@/lib/form-schema";
import { eventTag, invalidatePublic } from "@/lib/public-cache";
import type { FormFieldValues } from "@/lib/validation/catalog";

export type AdminFormField = FormFieldDef & { answerCount: number };

const DUPLICATE_KEY = "Key sudah dipakai field lain di event ini.";

export async function listFormFields(eventId: number, fieldId?: number): Promise<AdminFormField[]> {
  const only = fieldId ?? null;
  return sql<AdminFormField[]>`
    select f.id, f.key, f.label, f.type, f.options, f.validation, f.required, f.help_text as "helpText",
           f.placeholder, f.is_active as "isActive", f.position,
           (select count(*) from order_answers a where a.form_field_id = f.id)::int8 as "answerCount"
      from form_fields f
     where f.event_id = ${eventId} and (${only}::bigint is null or f.id = ${only})
     order by f.position, f.id`;
}

async function getOwned(eventId: number, fieldId: number): Promise<AdminFormField> {
  const [row] = await listFormFields(eventId, fieldId);
  if (!row) throw new UserError("Field tidak ditemukan.", 404);
  return row;
}

function columns(input: FormFieldValues, key: string) {
  return {
    key,
    label: input.label,
    type: input.type,
    options: sql.json(input.options as never),
    validation: sql.json(input.validation as never),
    help_text: input.helpText ?? null,
    placeholder: input.placeholder ?? null,
    required: input.required,
    is_active: input.isActive,
  };
}

function mapDuplicate(e: unknown): never {
  if (isUniqueViolation(e)) throw new UserError(DUPLICATE_KEY, 409, { key: DUPLICATE_KEY });
  throw e;
}

export async function createFormField(adminId: number, eventId: number, input: FormFieldValues): Promise<AdminFormField> {
  const [event] = await sql`select 1 from events where id = ${eventId}`;
  if (!event) throw new UserError("Event tidak ditemukan.", 404);
  const taken = (await sql<{ key: string }[]>`select key from form_fields where event_id = ${eventId}`).map((r) => r.key);
  if (input.key && taken.includes(input.key)) throw new UserError(DUPLICATE_KEY, 409, { key: DUPLICATE_KEY });
  const key = input.key ?? fieldKeyFromLabel(input.label, taken);
  const [{ id }] = await sql<{ id: number }[]>`
    insert into form_fields ${sql({ ...columns(input, key), event_id: eventId } as Record<string, unknown>)}
    returning id`.catch(mapDuplicate);
  await sql`
    update form_fields set position = (select coalesce(max(position), 0) + 1 from form_fields where event_id = ${eventId})
     where id = ${id}`;
  await writeAudit(sql, { adminId, action: "create", entity: "form_field", entityId: id, diff: { key, label: input.label, type: input.type } });
  invalidatePublic(eventTag(eventId));
  return getOwned(eventId, id);
}

export async function updateFormField(
  adminId: number,
  eventId: number,
  fieldId: number,
  input: FormFieldValues,
): Promise<AdminFormField> {
  const before = await getOwned(eventId, fieldId);
  const key = input.key ?? before.key;
  if (before.answerCount > 0 && (input.type !== before.type || key !== before.key)) {
    throw new UserError("Field ini sudah punya jawaban, jadi tipe dan key tidak bisa diubah. Buat field baru bila perlu.", 409);
  }
  await sql`update form_fields set ${sql(columns(input, key) as Record<string, unknown>)} where id = ${fieldId}`.catch(mapDuplicate);
  await writeAudit(sql, {
    adminId,
    action: "update",
    entity: "form_field",
    entityId: fieldId,
    diff: diffFields(
      { key: before.key, label: before.label, type: before.type, required: before.required, isActive: before.isActive },
      { key, label: input.label, type: input.type, required: input.required, isActive: input.isActive },
    ),
  });
  invalidatePublic(eventTag(eventId));
  return getOwned(eventId, fieldId);
}

export async function reorderFormFields(adminId: number, eventId: number, ids: number[]): Promise<void> {
  const current = (await sql<{ id: number }[]>`select id from form_fields where event_id = ${eventId}`).map((r) => r.id);
  const complete = ids.length === current.length && new Set(ids).size === ids.length && ids.every((id) => current.includes(id));
  if (!complete) throw new UserError("Urutan tidak lengkap. Muat ulang halaman lalu coba lagi.", 422);
  await sql`
    update form_fields f set position = v.pos
      from unnest(${ids}::bigint[]) with ordinality as v(id, pos)
     where f.id = v.id and f.event_id = ${eventId}`;
  await writeAudit(sql, { adminId, action: "reorder", entity: "form_field", entityId: eventId, diff: { ids } });
  invalidatePublic(eventTag(eventId));
}

export async function removeFormField(adminId: number, eventId: number, fieldId: number): Promise<void> {
  const field = await getOwned(eventId, fieldId);
  if (field.answerCount > 0) throw new UserError("Field ini sudah punya jawaban. Nonaktifkan saja.", 409);
  await sql`delete from form_fields where id = ${fieldId}`;
  await writeAudit(sql, { adminId, action: "delete", entity: "form_field", entityId: fieldId, diff: { key: field.key, label: field.label } });
  invalidatePublic(eventTag(eventId));
}
