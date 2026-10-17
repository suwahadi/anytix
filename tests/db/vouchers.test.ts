import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdmin } from "@/lib/admin-service";
import {
  createVoucher,
  deleteVoucher,
  generateVouchers,
  listVouchers,
  updateVoucher,
} from "@/lib/catalog/voucher-service";
import { sql } from "@/lib/db";
import { reserveTickets } from "@/lib/hold-service";
import { voucherGenerateInput, voucherInput } from "@/lib/validation/catalog";
import { checkoutTestOrder, cleanupTestEvents, createTestEvent } from "./helpers";

let adminId = 0;

beforeAll(async () => {
  adminId = await createAdmin(`test-admin-${randomUUID().slice(0, 8)}@example.com`, "rahasia-panjang-123");
});

afterAll(async () => {
  await cleanupTestEvents();
  await sql`delete from audit_logs where admin_id = ${adminId}`;
  await sql`delete from admins where id = ${adminId}`;
});

const input = (over: Record<string, unknown> = {}) =>
  voucherInput.parse({ code: `HEMAT${randomUUID().slice(0, 4)}`, type: "percent", value: 10, ...over });

const generate = (over: Record<string, unknown>) => voucherGenerateInput.parse({ type: "percent", value: 10, ...over });

async function rejected(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e as { status: number; message: string; fields?: Record<string, string> };
  }
  throw new Error("expected a rejection");
}

describe("voucher service", () => {
  it("create and list with usage", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10, price: 100000 }] });
    const v = await createVoucher(adminId, ev.eventId, input({ code: "Hemat10", maxUses: 5 }));
    await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }], voucherCode: "hemat10" });
    const [row] = await listVouchers(ev.eventId);
    expect(row).toMatchObject({ id: v.id, code: "Hemat10", type: "percent", value: 10, maxUses: 5, used: 0, held: 1, paidOrders: 0, discountTotal: 0 });
  });

  it("duplicate code ignores case", async () => {
    const ev = await createTestEvent();
    await createVoucher(adminId, ev.eventId, input({ code: "PROMO" }));
    const e = await rejected(createVoucher(adminId, ev.eventId, input({ code: "promo" })));
    expect(e.status).toBe(409);
    expect(e.fields?.code).toBe("Kode sudah dipakai di event ini.");
  });

  it("foreign category is refused", async () => {
    const ev = await createTestEvent();
    const other = await createTestEvent();
    const e = await rejected(createVoucher(adminId, ev.eventId, input({ ticketCategoryIds: [other.categoryIds[0]] })));
    expect(e.status).toBe(422);
    expect(e.fields?.ticketCategoryIds).toBe("Kategori tiket tidak ditemukan di event ini.");
  });

  it("max uses below usage is refused", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10, price: 100000 }] });
    const v = await createVoucher(adminId, ev.eventId, input({ code: "DUA", maxUses: 5 }));
    for (let i = 0; i < 2; i++) {
      await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }], voucherCode: "DUA" });
    }
    const e = await rejected(updateVoucher(adminId, ev.eventId, v.id, input({ code: "DUA", maxUses: 1 })));
    expect(e.status).toBe(422);
    expect(e.fields?.maxUses).toBe("Tidak boleh kurang dari pemakaian saat ini (2).");
  });

  it("used voucher cannot be deleted", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10, price: 100000 }] });
    const v = await createVoucher(adminId, ev.eventId, input({ code: "PAKAI" }));
    await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }], voucherCode: "PAKAI" });
    const e = await rejected(deleteVoucher(adminId, ev.eventId, v.id));
    expect(e.status).toBe(409);
    expect(e.message).toBe("Voucher sudah dipakai. Nonaktifkan saja.");
    const unused = await createVoucher(adminId, ev.eventId, input({ code: "KOSONG" }));
    await deleteVoucher(adminId, ev.eventId, unused.id);
    expect((await listVouchers(ev.eventId)).map((x) => x.code)).toEqual(["PAKAI"]);
  });

  it("generator makes unique codes with prefix", async () => {
    const ev = await createTestEvent();
    const codes = await generateVouchers(adminId, ev.eventId, generate({ prefix: "PROMO", count: 200, length: 8 }));
    expect(codes).toHaveLength(200);
    expect(new Set(codes).size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^PROMO[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(await listVouchers(ev.eventId)).toHaveLength(200);
  });

  it("generated voucher quotes a discount", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10, price: 100000 }] });
    const [code] = await generateVouchers(adminId, ev.eventId, generate({ value: 20, prefix: "", count: 1, length: 6 }));
    const visitorId = randomUUID();
    const hold = await reserveTickets({ visitorId, eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }], idempotencyKey: randomUUID() });
    const [{ q }] = await sql<{ q: { discount: number; voucher_error: string | null } }[]>`
      select quote_hold(${hold.id}::uuid, ${visitorId}::uuid, ${code.toLowerCase()}) as q`;
    expect(q).toMatchObject({ discount: 20000, voucher_error: null });
  });

  it("every mutation writes an audit row", async () => {
    const ev = await createTestEvent();
    const v = await createVoucher(adminId, ev.eventId, input({ code: "AUDIT" }));
    await updateVoucher(adminId, ev.eventId, v.id, input({ code: "AUDIT", value: 15 }));
    await generateVouchers(adminId, ev.eventId, generate({ prefix: "G", count: 2, length: 6 }));
    await deleteVoucher(adminId, ev.eventId, v.id);
    const rows = await sql<{ action: string; diff: Record<string, unknown> | null }[]>`
      select action, diff from audit_logs where admin_id = ${adminId} and entity = 'voucher'
         and (entity_id = ${String(v.id)} or (action = 'generate' and entity_id = ${String(ev.eventId)})) order by id`;
    expect(rows.map((r) => r.action)).toEqual(["create", "update", "generate", "delete"]);
    expect(rows[1].diff).toMatchObject({ value: [10, 15] });
    expect(rows[2].diff).toMatchObject({ count: 2, prefix: "G" });
  });

  it("voucher of another event is 404", async () => {
    const ev = await createTestEvent();
    const other = await createTestEvent();
    const v = await createVoucher(adminId, ev.eventId, input());
    expect((await rejected(updateVoucher(adminId, other.eventId, v.id, input()))).status).toBe(404);
    expect((await rejected(deleteVoucher(adminId, other.eventId, v.id))).status).toBe(404);
  });
});
