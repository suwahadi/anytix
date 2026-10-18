import { describe, expect, it } from "vitest";
import { normalizeInvoice } from "@/lib/booking/track-order";

describe("normalizeInvoice", () => {
  it("uppercases and drops spaces and dashes", () => {
    expect(normalizeInvoice(" a1234-abcd ")).toBe("A1234ABCD");
    expect(normalizeInvoice("A 1234 ABCD")).toBe("A1234ABCD");
  });

  it("maps look-alike letters the code alphabet never uses", () => {
    expect(normalizeInvoice("aO1IL2345")).toBe("A01112345");
  });

  it("rejects anything that cannot be an invoice code", () => {
    expect(normalizeInvoice("")).toBeNull();
    expect(normalizeInvoice("A1234ABC")).toBeNull();
    expect(normalizeInvoice("B1234ABCD")).toBeNull();
    expect(normalizeInvoice("A1234ABCU")).toBeNull();
  });
});
