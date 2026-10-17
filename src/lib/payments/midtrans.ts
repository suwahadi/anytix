import { createHash, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import type { SnapPayload } from "@/lib/payments/snap-payload";

export type MidtransConfig = { serverKey: string; clientKey: string; production: boolean; notificationUrl?: string };

export type MidtransStatus = {
  order_id: string;
  transaction_status: string;
  status_code: string;
  gross_amount: string;
  transaction_id?: string;
  payment_type?: string;
  [k: string]: unknown;
};

export type EngineStatus = "settlement" | "expire" | "cancel" | "deny" | "failure";

export class MidtransError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 10_000;

export function midtransConfig(): MidtransConfig {
  const env = getEnv();
  return {
    serverKey: env.MIDTRANS_SERVER_KEY ?? "",
    clientKey: env.MIDTRANS_CLIENT_KEY ?? "",
    production: env.MIDTRANS_IS_PRODUCTION,
    notificationUrl: env.MIDTRANS_NOTIFICATION_URL,
  };
}

const appHost = (c: MidtransConfig) => (c.production ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com");
const apiHost = (c: MidtransConfig) => (c.production ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com");

function headers(c: MidtransConfig, withNotification: boolean): Headers {
  const h = new Headers({
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Basic ${Buffer.from(`${c.serverKey}:`).toString("base64")}`,
  });
  if (withNotification && c.notificationUrl) h.set("x-override-notification", c.notificationUrl);
  return h;
}

async function call(url: string, init: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

export function snapScriptUrl(c: MidtransConfig = midtransConfig()): string {
  return `${appHost(c)}/snap/snap.js`;
}

export function midtransClientKey(c: MidtransConfig = midtransConfig()): string {
  return c.clientKey;
}

export async function createSnapTransaction(payload: SnapPayload, c: MidtransConfig = midtransConfig()): Promise<{ token: string; redirectUrl: string }> {
  const { status, body } = await call(`${appHost(c)}/snap/v1/transactions`, {
    method: "POST",
    headers: headers(c, true),
    body: JSON.stringify(payload),
  });
  if (status < 200 || status >= 300 || typeof body.token !== "string") {
    throw new MidtransError(`Snap create failed with HTTP ${status}`, status, body);
  }
  return { token: body.token, redirectUrl: String(body.redirect_url ?? "") };
}

/** Get Status, the source of truth for a payment; null when Midtrans has no such transaction. */
export async function getTransactionStatus(orderId: string, c: MidtransConfig = midtransConfig()): Promise<MidtransStatus | null> {
  const { status, body } = await call(`${apiHost(c)}/v2/${encodeURIComponent(orderId)}/status`, { method: "GET", headers: headers(c, false) });
  if (status === 404 || body.status_code === "404") return null;
  if (status < 200 || status >= 300) throw new MidtransError(`Get Status failed with HTTP ${status}`, status, body);
  return body as MidtransStatus;
}

async function changeStatus(orderId: string, action: "expire" | "cancel", c: MidtransConfig): Promise<void> {
  const { status, body } = await call(`${apiHost(c)}/v2/${encodeURIComponent(orderId)}/${action}`, {
    method: "POST",
    headers: headers(c, true),
  });
  if (status === 404 || body.status_code === "404") return;
  if (status < 200 || status >= 300) throw new MidtransError(`${action} failed with HTTP ${status}`, status, body);
}

export function expireTransaction(orderId: string, c: MidtransConfig = midtransConfig()): Promise<void> {
  return changeStatus(orderId, "expire", c);
}

export function cancelTransaction(orderId: string, c: MidtransConfig = midtransConfig()): Promise<void> {
  return changeStatus(orderId, "cancel", c);
}

export function verifyNotificationSignature(
  body: { order_id: string; status_code: string; gross_amount: string; signature_key: string },
  serverKey: string = midtransConfig().serverKey,
): boolean {
  const expected = createHash("sha512").update(`${body.order_id}${body.status_code}${body.gross_amount}${serverKey}`).digest();
  const given = Buffer.from(String(body.signature_key ?? ""), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Paid means settlement with status 200 (PRD §12); pending and unknown states change nothing. */
export function toEngineStatus(s: MidtransStatus): EngineStatus | null {
  switch (s.transaction_status) {
    case "settlement":
      return s.status_code === "200" ? "settlement" : null;
    case "expire":
    case "cancel":
    case "deny":
    case "failure":
      return s.transaction_status;
    default:
      return null;
  }
}
