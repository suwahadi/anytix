import { sql } from "@/lib/db";

export type PaymentMethods = { qris: boolean; va: Record<string, boolean> };

export type TransactionSettings = {
  holdMinutes: number;
  payMinutes: number;
  payGraceMinutes: number;
  serviceFee: number;
  paymentMethods: PaymentMethods;
};

export async function getSetting<T>(key: string): Promise<T> {
  const [row] = await sql<{ value: T }[]>`select value from settings where key = ${key}`;
  if (!row) throw new Error(`Missing setting ${key}`);
  return row.value;
}

export async function getTransactionSettings(): Promise<TransactionSettings> {
  const rows = await sql<{ key: string; value: unknown }[]>`
    select key, value from settings
    where key in ('hold_minutes', 'pay_minutes', 'pay_grace_minutes', 'service_fee', 'payment_methods')`;
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    holdMinutes: Number(map.hold_minutes),
    payMinutes: Number(map.pay_minutes),
    payGraceMinutes: Number(map.pay_grace_minutes),
    serviceFee: Number(map.service_fee),
    paymentMethods: map.payment_methods as PaymentMethods,
  };
}
