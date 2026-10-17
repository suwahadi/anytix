import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listRoute } from "@/app/api/admin/orders/route";
import {
  cancelOrder,
  countLatePaid,
  getAdminOrder,
  issueLateTickets,
  listAdminOrders,
  markOrderRefunded,
  resendOrderEmail,
} from "@/lib/admin/order-admin-service";
import { UserError } from "@/lib/admin-route";
import { createAdmin } from "@/lib/admin-service";
import { encrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { reserveTickets } from "@/lib/hold-service";
import { cancelTransaction } from "@/lib/payments/midtrans";
import { applyPaymentStatus } from "@/lib/payments/payment-service";
import { checkoutHold, checkoutTestOrder, cleanupTestEvents, createTestEvent, inventoryRow } from "./helpers";

vi.mock("@/lib/payments/midtrans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/midtrans")>()),
  cancelTransaction: vi.fn(async () => {}),
}));

let adminId = 0;

beforeAll(async () => {
  adminId = await createAdmin(`test-admin-${randomUUID().slice(0, 8)}@example.com`, "rahasia-panjang-123");
});

afterAll(async () => {
  await cleanupTestEvents();
  await sql`delete from audit_logs where admin_id = ${adminId}`;
  await sql`delete from admins where email like 'test-admin-%'`;
});

beforeEach(() => {
  vi.mocked(cancelTransaction).mockReset();
  vi.mocked(cancelTransaction).mockImplementation(async () => {});
});

async function userError(p: Promise<unknown>): Promise<UserError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof UserError) return e;
    throw e;
  }
  throw new Error("expected UserError");
}

async function order(capacity = 10) {
  const ev = await createTestEvent({ categories: [{ capacity }] });
  return { ev, ...(await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }] })) };
}

async function status(id: number) {
  const [o] = await sql<{ status: string }[]>`select status from orders where id = ${id}`;
  return o.status;
}

async function latePaidOrder() {
  const o = await order(1);
  await sql`update holds set expires_at = now() - make_interval(secs => 1) where id = ${o.holdId}`;
  await sql`select sweep_expired_holds()`;
  await reserveTickets({ visitorId: randomUUID(), eventId: o.ev.eventId, items: [{ inventoryId: o.ev.inventoryIds[0], qty: 1 }], idempotencyKey: randomUUID() });
  await applyPaymentStatus(o.midtransOrderId, "settlement", { transaction_id: randomUUID() });
  expect(await status(o.orderId)).toBe("late_paid_review");
  return o;
}

describe("admin orders", () => {
  it("search finds by invoice, email and uuid", async () => {
    const o = await order();
    const [row] = await sql<{ invoice_code: string; public_uuid: string }[]>`select invoice_code, public_uuid from orders where id = ${o.orderId}`;
    expect((await listAdminOrders({ q: row.invoice_code.toLowerCase(), page: 1 })).items.map((i) => i.id)).toContain(o.orderId);
    expect((await listAdminOrders({ q: row.public_uuid, page: 1 })).items.map((i) => i.id)).toEqual([o.orderId]);
    const byEmail = await listAdminOrders({ q: "budi@example", eventId: o.ev.eventId, page: 1 });
    expect(byEmail.items.map((i) => i.id)).toEqual([o.orderId]);
    expect(byEmail).toMatchObject({ total: 1, pageSize: 20 });
    expect((await listAdminOrders({ q: "%", eventId: o.ev.eventId, page: 1 })).total).toBe(0);
  });

  it("identity is masked in detail", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    const [field] = await sql<{ id: number }[]>`
      insert into form_fields (event_id, key, label, type, required, position) values (${ev.eventId}, 'identitas', 'Identitas', 'identity', true, 1) returning id`;
    const visitorId = randomUUID();
    const hold = await reserveTickets({ visitorId, eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }], idempotencyKey: randomUUID() });
    const created = await checkoutHold(hold.id, visitorId, {
      answers: [{ form_field_id: field.id, value: { type: "KTP" }, value_encrypted: encrypt("3201234567890001").toString("base64") }],
    });
    const detail = await getAdminOrder(created.id);
    expect(detail.answers).toEqual([{ label: "Identitas", type: "identity", value: { type: "KTP", number: "3201********0001" } }]);
    expect(JSON.stringify(detail)).not.toContain("3201234567890001");
  });

  it("cancel releases slots and calls midtrans first", async () => {
    const o = await order();
    await sql`update payments set snap_token = 'tok' where order_id = ${o.orderId}`;
    const seen: string[] = [];
    vi.mocked(cancelTransaction).mockImplementation(async () => {
      seen.push(await status(o.orderId));
    });
    await cancelOrder(adminId, o.orderId);
    expect(seen).toEqual(["awaiting_payment"]);
    expect(await status(o.orderId)).toBe("cancelled");
    expect((await inventoryRow(o.ev.inventoryIds[0])).held).toBe(0);
  });

  it("cancel skips midtrans when no snap transaction exists", async () => {
    const o = await order();
    await cancelOrder(adminId, o.orderId);
    expect(vi.mocked(cancelTransaction)).not.toHaveBeenCalled();
    expect(await status(o.orderId)).toBe("cancelled");
  });

  it("cancel paid order is 409", async () => {
    const o = await order();
    await applyPaymentStatus(o.midtransOrderId, "settlement", { transaction_id: randomUUID() });
    const err = await userError(cancelOrder(adminId, o.orderId));
    expect(err.status).toBe(409);
    expect(err.message).toBe("Hanya pesanan yang belum dibayar yang bisa dibatalkan.");
  });

  it("resend queues a new email job each time", async () => {
    const o = await order();
    await resendOrderEmail(adminId, o.orderId, {});
    await resendOrderEmail(adminId, o.orderId, {});
    const jobs = await sql`select payload from jobs where dedupe_key like ${`email:awaiting_payment:${o.orderId}:resend:%`}`;
    expect(jobs).toHaveLength(2);
  });

  it("resend to corrected email updates the order", async () => {
    const o = await order();
    await resendOrderEmail(adminId, o.orderId, { to: "budi.baru@example.com", updateBuyerEmail: true });
    const [row] = await sql<{ buyer_email: string }[]>`select buyer_email from orders where id = ${o.orderId}`;
    expect(row.buyer_email).toBe("budi.baru@example.com");
    const [job] = await sql<{ payload: { to: string } }[]>`select payload from jobs where dedupe_key like ${`email:awaiting_payment:${o.orderId}:resend:%`}`;
    expect(job.payload.to).toBe("budi.baru@example.com");
  });

  it("issue late tickets needs capacity", async () => {
    const o = await latePaidOrder();
    const err = await userError(issueLateTickets(adminId, o.orderId));
    expect(err.status).toBe(409);
    expect(err.message).toBe("Kuota belum cukup. Naikkan kuota kategori tiket dulu.");
    await sql`update ticket_inventory set capacity = capacity + 1 where id = ${o.ev.inventoryIds[0]}`;
    await issueLateTickets(adminId, o.orderId);
    expect(await status(o.orderId)).toBe("paid");
  });

  it("mark refunded only from review", async () => {
    const pending = await order();
    expect((await userError(markOrderRefunded(adminId, pending.orderId))).status).toBe(409);
    const o = await latePaidOrder();
    expect(await countLatePaid()).toBeGreaterThanOrEqual(1);
    await markOrderRefunded(adminId, o.orderId);
    expect(await status(o.orderId)).toBe("refunded");
  });

  it("every action writes an audit row", async () => {
    const o = await order();
    await resendOrderEmail(adminId, o.orderId, {});
    await cancelOrder(adminId, o.orderId);
    const rows = await sql<{ action: string }[]>`
      select action from audit_logs where admin_id = ${adminId} and entity = 'order' and entity_id = ${String(o.orderId)} order by id`;
    expect(rows.map((r) => r.action)).toEqual(["resend_email", "cancel"]);
  });

  it("list route needs an admin session", async () => {
    const res = await listRoute(new NextRequest("http://localhost/api/admin/orders"), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });
});
