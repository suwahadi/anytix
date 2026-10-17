import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdmin } from "@/lib/admin-service";
import { getSalesSummary, ordersCsv } from "@/lib/admin/sales-report";
import { encrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { applyPaymentStatus } from "@/lib/payments/payment-service";
import { reserveTickets } from "@/lib/hold-service";
import { checkoutTestOrder, cleanupTestEvents, createTestEvent, createTestVoucher } from "./helpers";

let adminId = 0;

beforeAll(async () => {
  adminId = await createAdmin(`test-admin-${randomUUID().slice(0, 8)}@example.com`, "rahasia-panjang-123");
});

afterAll(async () => {
  await cleanupTestEvents();
  await sql`delete from audit_logs where admin_id = ${adminId}`;
  await sql`delete from admins where id = ${adminId}`;
});

function rows(body: string): string[][] {
  return body
    .replace(/^﻿/, "")
    .trimEnd()
    .split("\r\n")
    .map((l) => l.split(","));
}

async function eventWithOrder() {
  const ev = await createTestEvent({ categories: [{ name: "Reguler", capacity: 10 }] });
  await createTestVoucher(ev.eventId, { code: "HEMAT", value: 10 });
  const [idf] = await sql<{ id: number }[]>`
    insert into form_fields (event_id, key, label, type, required, position) values (${ev.eventId}, 'identitas', 'Identitas', 'identity', true, 1) returning id`;
  const [size] = await sql<{ id: number }[]>`
    insert into form_fields (event_id, key, label, type, required, position) values (${ev.eventId}, 'ukuran', 'Ukuran', 'chips', true, 2) returning id`;
  const o = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 2 }], voucherCode: "hemat" });
  await sql`insert into order_answers (order_id, form_field_id, value, value_encrypted) values
            (${o.orderId}, ${idf.id}, ${sql.json({ type: "KTP" })}, ${encrypt("3201234567890001")}),
            (${o.orderId}, ${size.id}, ${sql.json("=cmd")}, null)`;
  await applyPaymentStatus(o.midtransOrderId, "settlement", { transaction_id: randomUUID() });
  return { ev, ...o };
}

describe("orders CSV", () => {
  it("export masks identity", async () => {
    const { ev } = await eventWithOrder();
    const { body } = await ordersCsv(adminId, { eventId: ev.eventId });
    expect(body).not.toContain("3201234567890001");
    expect(body).toContain("KTP 3201********0001");
  });

  it("export has form columns for one event", async () => {
    const { ev } = await eventWithOrder();
    const { body, filename } = await ordersCsv(adminId, { eventId: ev.eventId });
    const [header, row] = rows(body);
    const [{ slug }] = await sql<{ slug: string }[]>`select slug from events where id = ${ev.eventId}`;
    expect(header).toEqual([
      "Invoice", "Dibuat", "Dibayar", "Status", "Event", "Nama", "Email", "WhatsApp", "Item", "Subtotal", "Diskon", "Kode Promo",
      "Biaya Layanan", "Total", "Metode", "Identitas", "Ukuran",
    ]);
    expect(row.slice(3)).toEqual([
      "Lunas", `Test ${slug}`, "Budi Santoso", "budi@example.com", "6281234567890", "Reguler ×2", "200000", "20000", "HEMAT", "5000", "185000", "QRIS",
      "KTP 3201********0001", "'=cmd",
    ]);
    expect(row[1]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(filename).toMatch(/^pesanan-test-[a-z0-9-]+-\d{8}\.csv$/);
  });

  it("export writes an audit row", async () => {
    const { ev } = await eventWithOrder();
    await ordersCsv(adminId, { eventId: ev.eventId, status: "paid" });
    const [a] = await sql<{ diff: unknown }[]>`
      select diff from audit_logs where admin_id = ${adminId} and action = 'export' and entity = 'orders' order by id desc limit 1`;
    expect(a.diff).toEqual({ eventId: ev.eventId, status: "paid", rows: 1 });
  });

  it("sales summary counts paid orders only", async () => {
    const ev = await createTestEvent({ categories: [{ name: "Reguler", capacity: 10 }, { name: "VIP", capacity: 5 }] });
    const paid = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 2 }] });
    await applyPaymentStatus(paid.midtransOrderId, "settlement", { transaction_id: randomUUID() });
    const expired = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[1], qty: 1 }] });
    await applyPaymentStatus(expired.midtransOrderId, "expire", { transaction_id: randomUUID() });
    await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[1], qty: 1 }] });
    await reserveTickets({ visitorId: randomUUID(), eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }], idempotencyKey: randomUUID() });
    await sql`update tickets set checked_in_at = now() where order_id = ${paid.orderId} and seq = 1`;
    const row = (await getSalesSummary()).find((e) => e.eventId === ev.eventId);
    expect(row).toMatchObject({ paidOrders: 1, gross: 200000, discount: 0, fee: 5000, total: 205000, activeHolds: 2 });
    expect(row?.categories).toEqual([
      { name: "Reguler", capacity: 10, sold: 2, held: 1, available: 7, checkedIn: 1 },
      { name: "VIP", capacity: 5, sold: 0, held: 1, available: 4, checkedIn: 0 },
    ]);
  });
});
