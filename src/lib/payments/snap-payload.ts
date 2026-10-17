import { PAYMENT_METHODS } from "@/lib/validation/settings";

export type SnapOrder = {
  midtransOrderId: string;
  createdAt: Date;
  payExpiresAt: Date;
  paymentMethod: string;
  buyer: { name: string; email: string; phone: string };
  items: Array<{ ticketCategoryId: number; name: string; qty: number; unitPrice: number }>;
  discount: number;
  fee: number;
  total: number;
};

export type SnapPayload = {
  transaction_details: { order_id: string; gross_amount: number };
  item_details: Array<{ id: string; name: string; price: number; quantity: number }>;
  customer_details: { first_name: string; email: string; phone: string };
  enabled_payments: string[];
  expiry: { start_time: string; unit: "minute"; duration: number };
  page_expiry: { duration: number; unit: "minutes" };
};

const JAKARTA_OFFSET_MS = 7 * 3600_000;

function jakartaTime(d: Date): string {
  const t = new Date(d.getTime() + JAKARTA_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())} +0700`;
}

/** Snap request body; Midtrans rejects it unless the item rows add up to gross_amount exactly. */
export function buildSnapPayload(order: SnapOrder): SnapPayload {
  const method = PAYMENT_METHODS.find((m) => m.key === order.paymentMethod);
  if (!method) throw new Error(`Unknown payment method ${order.paymentMethod}`);
  const duration = Math.max(1, Math.round((order.payExpiresAt.getTime() - order.createdAt.getTime()) / 60_000));
  const items: SnapPayload["item_details"] = order.items.map((i) => ({
    id: `tc-${i.ticketCategoryId}`,
    name: i.name.slice(0, 50),
    price: i.unitPrice,
    quantity: i.qty,
  }));
  if (order.discount > 0) items.push({ id: "discount", name: "Diskon", price: -order.discount, quantity: 1 });
  if (order.fee > 0) items.push({ id: "service-fee", name: "Biaya Layanan", price: order.fee, quantity: 1 });
  return {
    transaction_details: { order_id: order.midtransOrderId, gross_amount: order.total },
    item_details: items,
    customer_details: { first_name: order.buyer.name, email: order.buyer.email, phone: order.buyer.phone },
    enabled_payments: [method.code],
    expiry: { start_time: jakartaTime(order.createdAt), unit: "minute", duration },
    page_expiry: { duration, unit: "minutes" },
  };
}
