import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelTransaction,
  createSnapTransaction,
  expireTransaction,
  getTransactionStatus,
  MidtransError,
  toEngineStatus,
  verifyNotificationSignature,
  type MidtransConfig,
} from "@/lib/payments/midtrans";

const cfg: MidtransConfig = { serverKey: "Mid-server-TEST", clientKey: "Mid-client-TEST", production: false, notificationUrl: "https://tunnel.example/api/webhooks/midtrans" };

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyNotificationSignature", () => {
  const body = { order_id: "A1234ABCD-1", status_code: "200", gross_amount: "205000.00" };
  const signature = createHash("sha512").update(`${body.order_id}${body.status_code}${body.gross_amount}${cfg.serverKey}`).digest("hex");

  it("accepts the Midtrans signature", () => {
    expect(verifyNotificationSignature({ ...body, signature_key: signature }, cfg.serverKey)).toBe(true);
  });

  it("rejects a changed amount or signature", () => {
    expect(verifyNotificationSignature({ ...body, gross_amount: "205001.00", signature_key: signature }, cfg.serverKey)).toBe(false);
    expect(verifyNotificationSignature({ ...body, signature_key: signature.slice(0, -1) + "0" }, cfg.serverKey)).toBe(signature.endsWith("0"));
    expect(verifyNotificationSignature({ ...body, signature_key: "short" }, cfg.serverKey)).toBe(false);
  });
});

describe("getTransactionStatus", () => {
  it("status 404 returns null", async () => {
    stubFetch(404, { status_code: "404", status_message: "Transaction doesn't exist." });
    expect(await getTransactionStatus("A1-1", cfg)).toBeNull();
  });

  it("a 200 response with status_code 404 in the body also returns null", async () => {
    stubFetch(200, { status_code: "404", status_message: "Transaction doesn't exist." });
    expect(await getTransactionStatus("A1-1", cfg)).toBeNull();
  });

  it("returns the status body and calls the sandbox core API", async () => {
    const fn = stubFetch(200, { order_id: "A1-1", transaction_status: "settlement", status_code: "200", gross_amount: "205000.00" });
    expect(await getTransactionStatus("A1-1", cfg)).toMatchObject({ transaction_status: "settlement" });
    expect(fn.mock.calls[0][0]).toBe("https://api.sandbox.midtrans.com/v2/A1-1/status");
  });
});

describe("toEngineStatus", () => {
  const s = (transaction_status: string, status_code = "200") => ({ order_id: "x", transaction_status, status_code, gross_amount: "1" });

  it("settlement needs status 200", () => {
    expect(toEngineStatus(s("settlement"))).toBe("settlement");
    expect(toEngineStatus(s("settlement", "201"))).toBeNull();
  });

  it("maps final states and ignores pending", () => {
    expect(toEngineStatus(s("expire", "407"))).toBe("expire");
    expect(toEngineStatus(s("cancel"))).toBe("cancel");
    expect(toEngineStatus(s("deny"))).toBe("deny");
    expect(toEngineStatus(s("failure", "202"))).toBe("failure");
    expect(toEngineStatus(s("pending", "201"))).toBeNull();
    expect(toEngineStatus(s("refund"))).toBeNull();
  });
});

describe("createSnapTransaction", () => {
  const payload = { transaction_details: { order_id: "A1-1", gross_amount: 1000 } } as never;

  it("sends basic auth and the override header", async () => {
    const fn = stubFetch(201, { token: "tok", redirect_url: "https://app.sandbox.midtrans.com/snap/v4/redirection/tok" });
    expect(await createSnapTransaction(payload, cfg)).toEqual({ token: "tok", redirectUrl: "https://app.sandbox.midtrans.com/snap/v4/redirection/tok" });
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://app.sandbox.midtrans.com/snap/v1/transactions");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(`Basic ${Buffer.from(`${cfg.serverKey}:`).toString("base64")}`);
    expect(headers.get("x-override-notification")).toBe(cfg.notificationUrl);
  });

  it("failure throws MidtransError with status", async () => {
    stubFetch(400, { error_messages: ["transaction_details.order_id sudah digunakan"] });
    const err = await createSnapTransaction(payload, cfg).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MidtransError);
    expect((err as MidtransError).status).toBe(400);
  });

  it("uses production hosts when production is on", async () => {
    const fn = stubFetch(201, { token: "t", redirect_url: "u" });
    await createSnapTransaction(payload, { ...cfg, production: true, notificationUrl: undefined });
    expect(fn.mock.calls[0][0]).toBe("https://app.midtrans.com/snap/v1/transactions");
    expect(new Headers(fn.mock.calls[0][1]?.headers).has("x-override-notification")).toBe(false);
  });
});

describe("error codes inside an HTTP 200 body", () => {
  it("expire rejects when Midtrans refuses in the body", async () => {
    stubFetch(200, { status_code: "412", status_message: "Merchant cannot modify the status of the transaction" });
    await expect(expireTransaction("A1-1", cfg)).rejects.toBeInstanceOf(MidtransError);
  });

  it("cancel rejects when Midtrans refuses in the body", async () => {
    stubFetch(200, { status_code: "412", status_message: "Merchant cannot modify the status of the transaction" });
    await expect(cancelTransaction("A1-1", cfg)).rejects.toBeInstanceOf(MidtransError);
  });

  it("expire accepts the 407 expired answer", async () => {
    stubFetch(200, { status_code: "407", transaction_status: "expire" });
    await expect(expireTransaction("A1-1", cfg)).resolves.toBeUndefined();
  });

  it("status keeps an expired transaction (407) and throws on a server error in the body", async () => {
    stubFetch(200, { order_id: "A1-1", status_code: "407", transaction_status: "expire", gross_amount: "1.00" });
    expect(await getTransactionStatus("A1-1", cfg)).toMatchObject({ transaction_status: "expire" });
    stubFetch(200, { status_code: "500", status_message: "Sorry, we encountered internal server error" });
    await expect(getTransactionStatus("A1-1", cfg)).rejects.toBeInstanceOf(MidtransError);
  });
});
