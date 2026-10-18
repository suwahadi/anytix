import { UserError } from "@/lib/admin-route";
import { diffFields, writeAudit } from "@/lib/audit";
import { sql } from "@/lib/db";
import { invalidatePublic, TAG_CONTENT } from "@/lib/public-cache";
import { sanitizeRichText } from "@/lib/rich-text";
import type { FaqValues } from "@/lib/validation/settings";

export type Faq = { id: number; question: string; answer: string; position: number; isActive: boolean };

const COLUMNS = sql`id, question, answer, position, is_active as "isActive"`;

export async function listFaqs(): Promise<Faq[]> {
  return sql<Faq[]>`select ${COLUMNS} from faqs order by position, id`;
}

async function getFaq(id: number): Promise<Faq> {
  const [row] = await sql<Faq[]>`select ${COLUMNS} from faqs where id = ${id}`;
  if (!row) throw new UserError("Pertanyaan tidak ditemukan.", 404);
  return row;
}

export async function createFaq(adminId: number, input: FaqValues): Promise<Faq> {
  const answer = sanitizeRichText(input.answer);
  const [{ id }] = await sql<{ id: number }[]>`
    insert into faqs (question, answer, is_active, position)
    values (${input.question}, ${answer}, ${input.isActive}, (select coalesce(max(position), 0) + 1 from faqs))
    returning id`;
  await writeAudit(sql, { adminId, action: "create", entity: "faq", entityId: id, diff: { question: input.question, isActive: input.isActive } });
  invalidatePublic(TAG_CONTENT);
  return getFaq(id);
}

export async function updateFaq(adminId: number, id: number, input: FaqValues): Promise<Faq> {
  const before = await getFaq(id);
  const after = { question: input.question, answer: sanitizeRichText(input.answer), isActive: input.isActive };
  await sql`
    update faqs set question = ${after.question}, answer = ${after.answer}, is_active = ${after.isActive}, updated_at = now()
     where id = ${id}`;
  await writeAudit(sql, { adminId, action: "update", entity: "faq", entityId: id, diff: diffFields(before, after) });
  invalidatePublic(TAG_CONTENT);
  return getFaq(id);
}

export async function reorderFaqs(adminId: number, ids: number[]): Promise<void> {
  const current = (await sql<{ id: number }[]>`select id from faqs`).map((r) => r.id);
  const complete = ids.length === current.length && new Set(ids).size === ids.length && ids.every((id) => current.includes(id));
  if (!complete) throw new UserError("Urutan tidak lengkap. Muat ulang halaman lalu coba lagi.", 422);
  await sql`
    update faqs f set position = v.pos
      from unnest(${ids}::bigint[]) with ordinality as v(id, pos)
     where f.id = v.id`;
  await writeAudit(sql, { adminId, action: "reorder", entity: "faq", entityId: "all", diff: { ids } });
  invalidatePublic(TAG_CONTENT);
}

export async function removeFaq(adminId: number, id: number): Promise<void> {
  const faq = await getFaq(id);
  await sql`delete from faqs where id = ${id}`;
  await writeAudit(sql, { adminId, action: "delete", entity: "faq", entityId: id, diff: { question: faq.question } });
  invalidatePublic(TAG_CONTENT);
}
