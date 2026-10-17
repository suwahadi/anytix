import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { adminAlertJob } from "../../worker/handlers/admin-alert";
import { emailJob } from "../../worker/handlers/email";
import { paymentCheckJob } from "../../worker/handlers/payment-check";
import { reconcileJob } from "../../worker/handlers/reconcile";
import { createAdmin } from "@/lib/admin-service";
import { sql } from "@/lib/db";
import { getEmailProvider } from "@/lib/email/email-provider";
import { reserveTickets } from "@/lib/hold-service";
import { expireTransaction, getTransactionStatus } from "@/lib/payments/midtrans";
import { applyPaymentStatus } from "@/lib/payments/payment-service";
import { checkoutTestOrder, cleanupTestEvents, createTestEvent, inventoryRow } from "./helpers";

const send = vi.fn(async (_m: { to: string; subject: string }) => ({ messageId: `<${randomUUID()}@test>` }));

vi.mock("@/lib/email/email-provider", () => ({ getEmailProvider: vi.fn(async () => ({ send })) }));
vi.mock("@/lib/payments/midtrans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/midtrans")>()),
  getTransactionStatus: vi.fn(),
  expireTransaction: vi.fn(async () => {}),
}));

let adminEmail = "";
let startedAt = new Date();

beforeAll(async () => {
  startedAt = new Date();
  adminEmail = `test-admin-${randomUUID().slice(0, 8)}@example.com`;
  await createAdmin(adminEmail, "rahasia-panjang-123");
});

afterAll(async () => {
  await sql`delete from jobs where created_at >= ${startedAt} and (dedupe_key like 'admin-alert:drift:%' or dedupe_key like 'payment-check:%:recon:%')`;
  await sql`delete from email_logs where order_id in (select o.id from orders o join events e on e.id = o.event_id where e.slug like 'test-%')`;
  await cleanupTestEvents();
  await sql`delete from admins where email like 'test-admin-%'`;
});

beforeEach(() => {
  send.mockClear();
  send.mockImplementation(async () => ({ messageId: `<${randomUUID()}@test>` }));
  vi.mocked(getEmailProvider).mockClear();
  vi.mocked(getTransactionStatus).mockReset();
  vi.mocked(expireTransaction).mockReset();
  vi.mocked(expireTransaction).mockImplementation(async () => {});
});

async function order(capacity = 10, qty = 1) {
  const ev = await createTestEvent({ categories: [{ capacity }] });
  return { ev, ...(await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty }] })) };
}

async function orderStatus(id: number) {
  const [row] = await sql<{ status: string }[]>`select status from orders where id = ${id}`;
  return row.status;
}

async function expireAndSweep(holdId: string) {
  await sql`update holds set expires_at = now() - interval '1 minute' where id = ${holdId}`;
  await sql`update orders set pay_expires_at = now() - interval '6 minutes' where hold_id = ${holdId}`;
  await sql`select sweep_expired_holds()`;
}

const status = (orderId: string, transaction_status: string, status_code: string) => ({ order_id: orderId, transaction_status, status_code, gross_amount: "105000.00", transaction_id: randomUUID() });

describe("worker jobs", () => {
  it("email job sends and logs", async () => {
    const o = await order();
    await emailJob({ type: "awaiting_payment", order_id: o.orderId });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe("budi@example.com");
    const [log] = await sql<{ status: string; message_id: string; to_email: string; type: string }[]>`
      select status, message_id, to_email, type from email_logs where order_id = ${o.orderId}`;
    expect(log).toMatchObject({ status: "sent", to_email: "budi@example.com", type: "awaiting_payment" });
    expect(log.message_id).toMatch(/@test>$/);
  });

  it("email job can send to another address", async () => {
    const o = await order();
    await emailJob({ type: "awaiting_payment", order_id: o.orderId, to: "budi.baru@example.com" });
    expect(send.mock.calls[0][0].to).toBe("budi.baru@example.com");
  });

  it("failed send logs and rethrows", async () => {
    const o = await order();
    send.mockRejectedValueOnce(new Error("SMTP 550 mailbox unavailable"));
    await expect(emailJob({ type: "awaiting_payment", order_id: o.orderId })).rejects.toThrow("SMTP 550");
    const [log] = await sql<{ status: string; error: string }[]>`select status, error from email_logs where order_id = ${o.orderId}`;
    expect(log).toMatchObject({ status: "failed", error: "SMTP 550 mailbox unavailable" });
  });

  it("payment-check without midtrans transaction expires order", async () => {
    const o = await order();
    await expireAndSweep(o.holdId);
    vi.mocked(getTransactionStatus).mockResolvedValue(null);
    await expect(paymentCheckJob({ order_id: o.orderId })).resolves.toBeUndefined();
    expect(await orderStatus(o.orderId)).toBe("expired");
    expect(vi.mocked(expireTransaction)).not.toHaveBeenCalled();
  });

  it("payment-check pending after deadline expires at midtrans first", async () => {
    const o = await order();
    await expireAndSweep(o.holdId);
    vi.mocked(getTransactionStatus).mockResolvedValue(status(o.midtransOrderId, "pending", "201"));
    const seen: string[] = [];
    vi.mocked(expireTransaction).mockImplementation(async () => {
      seen.push(await orderStatus(o.orderId));
    });
    await paymentCheckJob({ order_id: o.orderId });
    expect(seen).toEqual(["awaiting_payment"]);
    expect(await orderStatus(o.orderId)).toBe("expired");
  });

  it("payment-check before the deadline leaves a pending order alone", async () => {
    const o = await order();
    vi.mocked(getTransactionStatus).mockResolvedValue(status(o.midtransOrderId, "pending", "201"));
    await paymentCheckJob({ order_id: o.orderId });
    expect(await orderStatus(o.orderId)).toBe("awaiting_payment");
    expect(vi.mocked(expireTransaction)).not.toHaveBeenCalled();
  });

  it("payment-check settlement pays late order while quota is left", async () => {
    const o = await order();
    await expireAndSweep(o.holdId);
    vi.mocked(getTransactionStatus).mockResolvedValue(status(o.midtransOrderId, "settlement", "200"));
    await paymentCheckJob({ order_id: o.orderId });
    expect(await orderStatus(o.orderId)).toBe("paid");
    expect((await inventoryRow(o.ev.inventoryIds[0])).sold).toBe(1);
  });

  it("payment-check settlement without quota goes to review", async () => {
    const o = await order(1, 1);
    await expireAndSweep(o.holdId);
    const other = await reserveTickets({ visitorId: randomUUID(), eventId: o.ev.eventId, items: [{ inventoryId: o.ev.inventoryIds[0], qty: 1 }], idempotencyKey: randomUUID() });
    expect(other.status).toBe("held");
    vi.mocked(getTransactionStatus).mockResolvedValue(status(o.midtransOrderId, "settlement", "200"));
    await paymentCheckJob({ order_id: o.orderId });
    expect(await orderStatus(o.orderId)).toBe("late_paid_review");
  });

  it("payment-check skips orders that are already final", async () => {
    const o = await order();
    await applyPaymentStatus(o.midtransOrderId, "settlement", { transaction_id: randomUUID() });
    await paymentCheckJob({ order_id: o.orderId });
    expect(vi.mocked(getTransactionStatus)).not.toHaveBeenCalled();
  });

  it("reconcile fixes drift and alerts", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
    await sql`update ticket_inventory set held = held + 1 where id = ${ev.inventoryIds[0]}`;
    await reconcileJob({});
    expect((await inventoryRow(ev.inventoryIds[0])).held).toBe(0);
    const hour = new Date().toISOString().slice(0, 13);
    expect(await sql`select 1 from jobs where dedupe_key = ${`admin-alert:drift:${hour}`}`).toHaveLength(1);
  });

  it("reconcile re-polls stale pending payments", async () => {
    const o = await order();
    await sql`update orders set created_at = now() - interval '40 minutes' where id = ${o.orderId}`;
    await reconcileJob({});
    const hour = new Date().toISOString().slice(0, 13);
    expect(await sql`select 1 from jobs where dedupe_key = ${`payment-check:${o.orderId}:recon:${hour}`}`).toHaveLength(1);
  });

  it("late payment alert emails every active admin", async () => {
    const o = await order();
    await adminAlertJob({ kind: "late_paid", order_id: o.orderId });
    const recipients = send.mock.calls.map((c) => c[0].to);
    expect(recipients).toContain(adminEmail);
    expect(send.mock.calls[0][0].subject).toMatch(/^Perlu tindak lanjut: pembayaran terlambat A/);
  });
});
