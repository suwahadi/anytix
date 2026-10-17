import { randomBytes } from "node:crypto";
import { UserError } from "@/lib/admin-route";
import { diffFields, writeAudit } from "@/lib/audit";
import { sql, transaction, type Tx } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db-errors";
import type { VoucherGenerateValues, VoucherValues } from "@/lib/validation/catalog";

export type AdminVoucher = {
  id: number;
  code: string;
  type: "percent" | "fixed";
  value: number;
  maxDiscount: number | null;
  minQty: number;
  minSubtotal: number;
  ticketCategoryIds: number[];
  validFrom: Date | null;
  validTo: Date | null;
  maxUses: number | null;
  used: number;
  held: number;
  active: boolean;
  paidOrders: number;
  discountTotal: number;
};

const DUPLICATE = "Kode sudah dipakai di event ini.";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function query(eventId: number, f: { id?: number; q?: string } = {}) {
  const id = f.id ?? null;
  const q = f.q?.trim() ? `%${f.q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
  return sql<AdminVoucher[]>`
    select v.id, v.code, v.type, v.value, v.max_discount as "maxDiscount", v.min_qty as "minQty", v.min_subtotal as "minSubtotal",
           coalesce(v.ticket_category_ids, '{}')::int[] as "ticketCategoryIds", v.valid_from as "validFrom", v.valid_to as "validTo",
           v.max_uses as "maxUses", v.used, v.held, v.active,
           coalesce(s.n, 0)::int as "paidOrders", coalesce(s.d, 0)::int8 as "discountTotal"
      from vouchers v
      left join lateral (
        select count(*) as n, sum(o.discount_amount) as d from orders o where o.voucher_id = v.id and o.status = 'paid'
      ) s on true
     where v.event_id = ${eventId} and (${id}::bigint is null or v.id = ${id}) and (${q}::text is null or v.code ilike ${q})
     order by v.id desc`;
}

export function listVouchers(eventId: number, q?: string): Promise<AdminVoucher[]> {
  return query(eventId, { q });
}

async function getOwned(eventId: number, id: number): Promise<AdminVoucher> {
  const [row] = await query(eventId, { id });
  if (!row) throw new UserError("Voucher tidak ditemukan.", 404);
  return row;
}

async function checkCategories(eventId: number, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from ticket_categories where event_id = ${eventId} and id = any(${ids})`;
  if (n !== new Set(ids).size) {
    throw new UserError("Periksa kembali isian yang ditandai.", 422, { ticketCategoryIds: "Kategori tiket tidak ditemukan di event ini." });
  }
}

function columns(input: Omit<VoucherValues, "code">) {
  return {
    type: input.type,
    value: input.value,
    max_discount: input.type === "percent" ? input.maxDiscount : null,
    min_qty: input.minQty,
    min_subtotal: input.minSubtotal,
    ticket_category_ids: input.ticketCategoryIds.length > 0 ? input.ticketCategoryIds : null,
    valid_from: input.validFrom ? new Date(input.validFrom) : null,
    valid_to: input.validTo ? new Date(input.validTo) : null,
    max_uses: input.maxUses,
    active: input.active,
  };
}

function auditable(v: AdminVoucher | VoucherValues) {
  return {
    code: v.code,
    type: v.type,
    value: v.value,
    maxDiscount: v.type === "percent" ? v.maxDiscount : null,
    minQty: v.minQty,
    minSubtotal: v.minSubtotal,
    ticketCategoryIds: [...v.ticketCategoryIds].sort((a, b) => a - b),
    validFrom: v.validFrom ? new Date(v.validFrom).toISOString() : null,
    validTo: v.validTo ? new Date(v.validTo).toISOString() : null,
    maxUses: v.maxUses,
    active: v.active,
  };
}

function mapDuplicate(e: unknown): never {
  if (isUniqueViolation(e)) throw new UserError(DUPLICATE, 409, { code: DUPLICATE });
  throw e;
}

export async function createVoucher(adminId: number, eventId: number, input: VoucherValues): Promise<AdminVoucher> {
  await checkCategories(eventId, input.ticketCategoryIds);
  const id = await transaction(async (tx) => {
    const [row] = await tx<{ id: number }[]>`
      insert into vouchers ${tx({ event_id: eventId, code: input.code, ...columns(input) } as Record<string, unknown>)} returning id`;
    await writeAudit(tx, { adminId, action: "create", entity: "voucher", entityId: row.id, diff: auditable(input) });
    return row.id;
  }).catch(mapDuplicate);
  return getOwned(eventId, id);
}

export async function updateVoucher(adminId: number, eventId: number, id: number, input: VoucherValues): Promise<AdminVoucher> {
  const before = await getOwned(eventId, id);
  await checkCategories(eventId, input.ticketCategoryIds);
  const inUse = before.used + before.held;
  if (input.maxUses !== null && input.maxUses < inUse) {
    throw new UserError("Periksa kembali isian yang ditandai.", 422, { maxUses: `Tidak boleh kurang dari pemakaian saat ini (${inUse}).` });
  }
  await transaction(async (tx) => {
    await tx`update vouchers set ${tx({ code: input.code, ...columns(input) } as Record<string, unknown>)} where id = ${id}`;
    await writeAudit(tx, { adminId, action: "update", entity: "voucher", entityId: id, diff: diffFields(auditable(before), auditable(input)) });
  }).catch(mapDuplicate);
  return getOwned(eventId, id);
}

export async function deleteVoucher(adminId: number, eventId: number, id: number): Promise<void> {
  const before = await getOwned(eventId, id);
  const [{ used }] = await sql<{ used: boolean }[]>`select exists (select 1 from orders where voucher_id = ${id}) as used`;
  if (used) throw new UserError("Voucher sudah dipakai. Nonaktifkan saja.", 409);
  await transaction(async (tx) => {
    await tx`delete from vouchers where id = ${id}`;
    await writeAudit(tx, { adminId, action: "delete", entity: "voucher", entityId: id, diff: auditable(before) });
  });
}

function randomCode(length: number): string {
  return [...randomBytes(length)].map((b) => CROCKFORD[b & 31]).join("");
}

async function insertCodes(tx: Tx, eventId: number, codes: string[], cols: ReturnType<typeof columns>): Promise<string[]> {
  const rows = codes.map((code) => ({ event_id: eventId, code, ...cols }));
  const inserted = await tx<{ code: string }[]>`
    insert into vouchers ${tx(rows as Record<string, unknown>[])} on conflict do nothing returning code`;
  return inserted.map((r) => r.code);
}

export async function generateVouchers(adminId: number, eventId: number, input: VoucherGenerateValues): Promise<string[]> {
  await checkCategories(eventId, input.ticketCategoryIds);
  const cols = columns(input);
  return transaction(async (tx) => {
    const codes: string[] = [];
    for (let round = 0; codes.length < input.count; round++) {
      if (round >= 10) throw new UserError("Kode acak terlalu sering bentrok. Perpanjang kode lalu coba lagi.", 409);
      const missing = input.count - codes.length;
      const batch = [...new Set(Array.from({ length: missing }, () => input.prefix + randomCode(input.length)))];
      codes.push(...(await insertCodes(tx, eventId, batch, cols)));
    }
    await writeAudit(tx, { adminId, action: "generate", entity: "voucher", entityId: eventId, diff: { count: codes.length, prefix: input.prefix } });
    return codes;
  });
}
