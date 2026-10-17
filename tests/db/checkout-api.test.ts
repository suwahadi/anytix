import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as checkout } from "@/app/api/holds/[id]/checkout/route";
import { POST as pay } from "@/app/api/orders/[uuid]/pay/route";
import { decrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { reserveTickets } from "@/lib/hold-service";
import { createSnapTransaction } from "@/lib/payments/midtrans";
import { verifyTurnstile } from "@/lib/turnstile";
import { newVisitorCookie } from "@/lib/visitor";
import { checkoutTestOrder, cleanupTestEvents, createTestEvent, createTestVoucher } from "./helpers";

vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: vi.fn(async () => true) }));
vi.mock("@/lib/payments/midtrans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/midtrans")>()),
  createSnapTransaction: vi.fn(async () => ({ token: "snap-token", redirectUrl: "https://app.sandbox.midtrans.com/snap/x" })),
}));

afterAll(async () => {
  await cleanupTestEvents();
});

beforeEach(() => {
  vi.mocked(verifyTurnstile).mockResolvedValue(true);
  vi.mocked(createSnapTransaction).mockReset();
  vi.mocked(createSnapTransaction).mockResolvedValue({ token: "snap-token", redirectUrl: "https://app.sandbox.midtrans.com/snap/x" });
});

const buyer = { name: "Budi Santoso", email: "budi@example.com", countryCode: "62", phone: "0812 3456 7890" };

async function setup(opts: { identity?: boolean; requiredText?: boolean } = {}) {
  const ev = await createTestEvent({ categories: [{ name: "Reguler", capacity: 10 }] });
  if (opts.identity) {
    await sql`insert into form_fields (event_id, key, label, type, required, position) values (${ev.eventId}, 'identitas', 'Identitas', 'identity', true, 1)`;
  }
  if (opts.requiredText) {
    await sql`insert into form_fields (event_id, key, label, type, required, position) values (${ev.eventId}, 'ukuran', 'Ukuran kaos', 'short_text', true, 2)`;
  }
  const visitor = newVisitorCookie();
  const hold = await reserveTickets({ visitorId: visitor.id, eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 2 }], idempotencyKey: randomUUID() });
  return { ev, visitor, holdId: hold.id };
}

function call(holdId: string, vid: string, body: Record<string, unknown>) {
  return checkout(
    new NextRequest(`http://localhost/api/holds/${holdId}/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `vid=${vid}`, "x-forwarded-for": "10.0.0.2" },
      body: JSON.stringify({ turnstileToken: "t", buyer, answers: {}, paymentMethod: "qris", consents: { terms: true, privacy: true }, ...body }),
    }),
    { params: Promise.resolve({ id: holdId }) },
  );
}

function callPay(uuid: string) {
  return pay(new NextRequest(`http://localhost/api/orders/${uuid}/pay`, { method: "POST", headers: { "x-forwarded-for": "10.0.0.3" } }), {
    params: Promise.resolve({ uuid }),
  });
}

describe("checkout API", () => {
  it("checkout creates order and snap token", async () => {
    const { visitor, holdId } = await setup();
    const res = await call(holdId, visitor.value, {});
    expect(res.status).toBe(201);
    const { orderUuid } = await res.json();
    const [order] = await sql<{ id: number; status: string; buyer_phone: string; payment_method: string }[]>`
      select id, status, buyer_phone, payment_method from orders where public_uuid = ${orderUuid}`;
    expect(order).toMatchObject({ status: "awaiting_payment", buyer_phone: "6281234567890", payment_method: "qris" });
    const [payment] = await sql<{ snap_token: string }[]>`select snap_token from payments where order_id = ${order.id}`;
    expect(payment.snap_token).toBe("snap-token");
    const consents = await sql<{ purpose: string }[]>`select purpose from consents where order_id = ${order.id} order by purpose`;
    expect(consents.map((c) => c.purpose)).toEqual(["privacy", "terms"]);
  });

  it("identity answer is encrypted and never in the payload", async () => {
    const { visitor, holdId } = await setup({ identity: true });
    const res = await call(holdId, visitor.value, { answers: { identitas: { type: "KTP", number: "3201234567890001" } } });
    expect(res.status).toBe(201);
    const { orderUuid } = await res.json();
    expect(JSON.stringify(vi.mocked(createSnapTransaction).mock.calls)).not.toContain("3201234567890001");
    const [answer] = await sql<{ value: unknown; value_encrypted: Buffer }[]>`
      select a.value, a.value_encrypted from order_answers a join orders o on o.id = a.order_id where o.public_uuid = ${orderUuid}`;
    expect(answer.value).toEqual({ type: "KTP" });
    expect(decrypt(Buffer.from(answer.value_encrypted))).toBe("3201234567890001");
    const purposes = await sql<{ purpose: string }[]>`
      select c.purpose from consents c join orders o on o.id = c.order_id where o.public_uuid = ${orderUuid} order by c.purpose`;
    expect(purposes.map((p) => p.purpose)).toEqual(["identity_verification", "privacy", "terms"]);
  });

  it("second checkout returns the same order without turnstile", async () => {
    const { visitor, holdId } = await setup();
    const first = await (await call(holdId, visitor.value, {})).json();
    vi.mocked(verifyTurnstile).mockResolvedValue(false);
    const again = await call(holdId, visitor.value, {});
    expect(again.status).toBe(200);
    expect((await again.json()).orderUuid).toBe(first.orderUuid);
  });

  it("checkout on expired hold is 410", async () => {
    const { visitor, holdId } = await setup();
    await sql`update holds set expires_at = now() - interval '1 minute' where id = ${holdId}`;
    const res = await call(holdId, visitor.value, {});
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe("Waktu habis, slot dilepas");
  });

  it("missing consent is 422", async () => {
    const { visitor, holdId } = await setup();
    const res = await call(holdId, visitor.value, { consents: { terms: true, privacy: false } });
    expect(res.status).toBe(422);
    expect((await res.json()).fields.consents).toBe("Centang kedua persetujuan untuk melanjutkan.");
  });

  it("disabled payment method is 422", async () => {
    const { visitor, holdId } = await setup();
    const res = await call(holdId, visitor.value, { paymentMethod: "dana" });
    expect(res.status).toBe(422);
    expect((await res.json()).fields.paymentMethod).toBe("Pilih metode pembayaran.");
  });

  it("answer validation errors are keyed by field", async () => {
    const { visitor, holdId } = await setup({ requiredText: true });
    const res = await call(holdId, visitor.value, { answers: {} });
    expect(res.status).toBe(422);
    expect((await res.json()).fields["answers.ukuran"]).toBe("Wajib diisi.");
  });

  it("another visitor cannot check out the hold", async () => {
    const { holdId } = await setup();
    const res = await call(holdId, newVisitorCookie().value, {});
    expect(res.status).toBe(404);
  });

  it("snap failure still returns the order", async () => {
    const { MidtransError } = await import("@/lib/payments/midtrans");
    vi.mocked(createSnapTransaction).mockRejectedValueOnce(new MidtransError("down", 500, {}));
    const { visitor, holdId } = await setup();
    const res = await call(holdId, visitor.value, {});
    expect(res.status).toBe(201);
    const { orderUuid } = await res.json();
    const retry = await callPay(orderUuid);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ token: "snap-token" });
    expect(retry.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("snap network error or timeout still returns the order", async () => {
    vi.mocked(createSnapTransaction).mockRejectedValueOnce(new TypeError("fetch failed"));
    const { visitor, holdId } = await setup();
    const res = await call(holdId, visitor.value, {});
    expect(res.status).toBe(201);
    vi.mocked(createSnapTransaction).mockRejectedValueOnce(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    const retry = await callPay((await res.json()).orderUuid);
    expect(retry.status).toBe(409);
    expect((await retry.json()).error).toBe("Pembayaran belum bisa disiapkan. Coba lagi sebentar lagi.");
  });

  it("pay reuses the stored token", async () => {
    const { visitor, holdId } = await setup();
    const { orderUuid } = await (await call(holdId, visitor.value, {})).json();
    await callPay(orderUuid);
    expect(vi.mocked(createSnapTransaction)).toHaveBeenCalledTimes(1);
  });

  it("pay after deadline is 409", async () => {
    const { visitor, holdId } = await setup();
    const { orderUuid } = await (await call(holdId, visitor.value, {})).json();
    await sql`update orders set pay_expires_at = now() - interval '1 minute' where public_uuid = ${orderUuid}`;
    await sql`update payments set snap_token = null where order_id = (select id from orders where public_uuid = ${orderUuid})`;
    const res = await callPay(orderUuid);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Batas bayar sudah lewat.");
  });

  it("checkout applies voucher", async () => {
    const { ev, visitor, holdId } = await setup();
    const voucherId = await createTestVoucher(ev.eventId, { code: "HEMAT", value: 10 });
    const res = await call(holdId, visitor.value, { voucherCode: "hemat" });
    expect(res.status).toBe(201);
    const { orderUuid } = await res.json();
    const [order] = await sql<{ discount_amount: number; voucher_id: number }[]>`
      select discount_amount, voucher_id from orders where public_uuid = ${orderUuid}`;
    expect(order).toMatchObject({ discount_amount: 20000, voucher_id: voucherId });
    const [v] = await sql<{ held: number }[]>`select held from vouchers where id = ${voucherId}`;
    expect(v.held).toBe(1);
  });

  it("checkout with exhausted voucher is 409", async () => {
    const { ev, visitor, holdId } = await setup();
    await createTestVoucher(ev.eventId, { code: "SEKALI", value: 10, maxUses: 1 });
    await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }], voucherCode: "SEKALI" });
    const res = await call(holdId, visitor.value, { voucherCode: "SEKALI" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "Kode promo tidak bisa dipakai.", code: "VOUCHER" });
    const [h] = await sql<{ status: string }[]>`select status from holds where id = ${holdId}`;
    expect(h.status).toBe("held");
  });
});
