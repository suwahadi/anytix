import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as webhook } from "@/app/api/webhooks/midtrans/route";
import { sql } from "@/lib/db";
import { getTransactionStatus, midtransConfig, type MidtransStatus } from "@/lib/payments/midtrans";
import { checkoutTestOrder, cleanupTestEvents, createTestEvent, inventoryRow } from "./helpers";

vi.mock("@/lib/payments/midtrans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/midtrans")>()),
  getTransactionStatus: vi.fn(),
}));

afterAll(async () => {
  await cleanupTestEvents();
});

beforeEach(() => {
  vi.mocked(getTransactionStatus).mockReset();
});

function notification(orderId: string, transactionStatus: string, statusCode = "200", grossAmount = "205000.00", transactionId = "trx-1") {
  const signature = createHash("sha512").update(`${orderId}${statusCode}${grossAmount}${midtransConfig().serverKey}`).digest("hex");
  return {
    order_id: orderId,
    transaction_status: transactionStatus,
    status_code: statusCode,
    gross_amount: grossAmount,
    transaction_id: transactionId,
    signature_key: signature,
  };
}

function midtransSays(n: ReturnType<typeof notification>): MidtransStatus {
  return { order_id: n.order_id, transaction_status: n.transaction_status, status_code: n.status_code, gross_amount: n.gross_amount, transaction_id: n.transaction_id };
}

function post(body: unknown) {
  return webhook(
    new NextRequest("http://localhost/api/webhooks/midtrans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

async function orderStatus(orderId: number) {
  const [row] = await sql<{ status: string }[]>`select status from orders where id = ${orderId}`;
  return row.status;
}

async function paidOrder() {
  const ev = await createTestEvent({ categories: [{ capacity: 10 }] });
  const order = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 2 }] });
  return { ev, order };
}

describe("Midtrans webhook", () => {
  it("bad signature is 401", async () => {
    const { order } = await paidOrder();
    const n = notification(order.midtransOrderId, "settlement");
    const res = await post({ ...n, gross_amount: "1.00" });
    expect(res.status).toBe(401);
    expect(await post("not json")).toHaveProperty("status", 401);
    expect(vi.mocked(getTransactionStatus)).not.toHaveBeenCalled();
  });

  it("settlement makes the order paid", async () => {
    const { ev, order } = await paidOrder();
    const n = notification(order.midtransOrderId, "settlement");
    vi.mocked(getTransactionStatus).mockResolvedValue(midtransSays(n));
    const res = await post(n);
    expect(res.status).toBe(200);
    expect(await orderStatus(order.orderId)).toBe("paid");
    expect(await inventoryRow(ev.inventoryIds[0])).toMatchObject({ sold: 2, held: 0 });
    const [tickets] = await sql<{ n: number }[]>`select count(*)::int as n from tickets where order_id = ${order.orderId}`;
    expect(tickets.n).toBe(2);
    const jobs = await sql`select 1 from jobs where dedupe_key = ${`email:paid:${order.orderId}`}`;
    expect(jobs).toHaveLength(1);
  });

  it("duplicate settlement is a no-op", async () => {
    const { ev, order } = await paidOrder();
    const n = notification(order.midtransOrderId, "settlement");
    vi.mocked(getTransactionStatus).mockResolvedValue(midtransSays(n));
    await post(n);
    const again = await post(n);
    expect(again.status).toBe(200);
    expect(await inventoryRow(ev.inventoryIds[0])).toMatchObject({ sold: 2, held: 0 });
    const events = await sql`select 1 from payment_events where midtrans_order_id = ${order.midtransOrderId} and transaction_status = 'settlement'`;
    expect(events).toHaveLength(1);
  });

  it("expire after settlement keeps paid", async () => {
    const { order } = await paidOrder();
    const paid = notification(order.midtransOrderId, "settlement");
    vi.mocked(getTransactionStatus).mockResolvedValue(midtransSays(paid));
    await post(paid);
    const expired = notification(order.midtransOrderId, "expire", "407");
    vi.mocked(getTransactionStatus).mockResolvedValue(midtransSays(expired));
    expect((await post(expired)).status).toBe(200);
    expect(await orderStatus(order.orderId)).toBe("paid");
  });

  it("unknown order is 200", async () => {
    const n = notification("NOPE-1", "settlement");
    vi.mocked(getTransactionStatus).mockResolvedValue(midtransSays(n));
    const res = await post(n);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("pending notification changes nothing", async () => {
    const { order } = await paidOrder();
    const n = notification(order.midtransOrderId, "pending", "201");
    vi.mocked(getTransactionStatus).mockResolvedValue(midtransSays(n));
    expect((await post(n)).status).toBe(200);
    expect(await orderStatus(order.orderId)).toBe("awaiting_payment");
    const [payment] = await sql<{ raw_last: { transaction_status: string } }[]>`
      select raw_last from payments where midtrans_order_id = ${order.midtransOrderId}`;
    expect(payment.raw_last.transaction_status).toBe("pending");
  });

  it("notification body is not trusted", async () => {
    const { order } = await paidOrder();
    const n = notification(order.midtransOrderId, "settlement");
    vi.mocked(getTransactionStatus).mockResolvedValue({ ...midtransSays(n), transaction_status: "pending", status_code: "201" });
    expect((await post(n)).status).toBe(200);
    expect(await orderStatus(order.orderId)).toBe("awaiting_payment");
  });

  it("an error after the signature check still answers 200", async () => {
    const { order } = await paidOrder();
    vi.mocked(getTransactionStatus).mockRejectedValue(new Error("network down"));
    const res = await post(notification(order.midtransOrderId, "settlement"));
    expect(res.status).toBe(200);
    expect(await orderStatus(order.orderId)).toBe("awaiting_payment");
  });
});
