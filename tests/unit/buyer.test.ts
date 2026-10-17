import { describe, expect, it } from "vitest";
import { buyerInput, normalizePhone } from "@/lib/booking/buyer";

describe("normalizePhone", () => {
  it("drops the leading zero and punctuation", () => {
    expect(normalizePhone("62", "0812-3456-7890")).toBe("6281234567890");
  });

  it("leading zero after country code is dropped", () => {
    expect(normalizePhone("62", "+62 0812 3456 7890")).toBe("6281234567890");
  });

  it("accepts a number typed with the country code", () => {
    expect(normalizePhone("62", "+62 812 3456 7890")).toBe("6281234567890");
    expect(normalizePhone("62", "6281234567890")).toBe("6281234567890");
  });

  it("rejects numbers that are too short or too long", () => {
    expect(normalizePhone("62", "812345")).toBeNull();
    expect(normalizePhone("62", "8".repeat(20))).toBeNull();
  });

  it("uses the chosen country code", () => {
    expect(normalizePhone("65", "9123 4567")).toBe("6591234567");
  });
});

describe("buyerInput", () => {
  it("normalizes the phone and lowercases nothing else", () => {
    const parsed = buyerInput.parse({ name: " Budi Santoso ", email: "Budi@Example.com", countryCode: "62", phone: "0812 3456 7890" });
    expect(parsed).toEqual({ name: "Budi Santoso", email: "Budi@Example.com", phone: "6281234567890" });
  });

  it("reports field errors in Indonesian", () => {
    const res = buyerInput.safeParse({ name: "B", email: "bukan-email", countryCode: "62", phone: "123" });
    expect(res.success).toBe(false);
    const fields = Object.fromEntries((res.error?.issues ?? []).map((i) => [i.path.join("."), i.message]));
    expect(fields).toEqual({ name: "Nama minimal 2 karakter.", email: "Email tidak valid.", phone: "Nomor WhatsApp tidak valid." });
  });
});
