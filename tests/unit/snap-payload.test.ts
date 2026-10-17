import { describe, expect, it } from "vitest";
import { buildSnapPayload, type SnapOrder } from "@/lib/payments/snap-payload";

const base: SnapOrder = {
  midtransOrderId: "A1234ABCD-1",
  createdAt: new Date("2026-12-01T03:04:05Z"),
  payExpiresAt: new Date("2026-12-01T03:19:05Z"),
  paymentMethod: "qris",
  buyer: { name: "Budi Santoso", email: "budi@example.com", phone: "6281234567890" },
  items: [{ ticketCategoryId: 7, name: "Reguler", qty: 2, unitPrice: 100000 }],
  discount: 15000,
  fee: 5000,
  total: 190000,
};

describe("buildSnapPayload", () => {
  it("item rows sum to gross_amount", () => {
    const p = buildSnapPayload(base);
    expect(p.transaction_details).toEqual({ order_id: "A1234ABCD-1", gross_amount: 190000 });
    const sum = p.item_details.reduce((s, i) => s + i.price * i.quantity, 0);
    expect(sum).toBe(190000);
    expect(p.item_details).toContainEqual({ id: "discount", name: "Diskon", price: -15000, quantity: 1 });
    expect(p.item_details).toContainEqual({ id: "service-fee", name: "Biaya Layanan", price: 5000, quantity: 1 });
    expect(p.item_details[0]).toEqual({ id: "tc-7", name: "Reguler", price: 100000, quantity: 2 });
  });

  it("long names are cut to 50", () => {
    const p = buildSnapPayload({ ...base, items: [{ ticketCategoryId: 1, name: "x".repeat(80), qty: 1, unitPrice: 200000 }], total: 190000 });
    expect(p.item_details[0].name).toHaveLength(50);
  });

  it("expiry uses Jakarta offset", () => {
    const p = buildSnapPayload(base);
    expect(p.expiry).toEqual({ start_time: "2026-12-01 10:04:05 +0700", unit: "minute", duration: 15 });
    expect(p.page_expiry).toEqual({ duration: 15, unit: "minutes" });
  });

  it("bank key maps to snap code", () => {
    expect(buildSnapPayload({ ...base, paymentMethod: "mandiri" }).enabled_payments).toEqual(["echannel"]);
    expect(buildSnapPayload(base).enabled_payments).toEqual(["other_qris"]);
  });

  it("no fee or discount row when they are 0", () => {
    const p = buildSnapPayload({ ...base, discount: 0, fee: 0, total: 200000 });
    expect(p.item_details.map((i) => i.id)).toEqual(["tc-7"]);
  });

  it("customer details come from the buyer", () => {
    expect(buildSnapPayload(base).customer_details).toEqual({ first_name: "Budi Santoso", email: "budi@example.com", phone: "6281234567890" });
  });
});
