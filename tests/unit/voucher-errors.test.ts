import { describe, expect, it } from "vitest";
import { voucherErrorMessage } from "@/lib/booking/voucher-errors";

describe("voucherErrorMessage", () => {
  it("maps every engine code to Indonesian copy", () => {
    expect(voucherErrorMessage(null)).toBeNull();
    expect(voucherErrorMessage("NOT_FOUND")).toBe("Kode promo tidak ditemukan.");
    for (const code of ["INACTIVE", "NOT_STARTED", "ENDED"]) expect(voucherErrorMessage(code)).toBe("Kode promo sedang tidak berlaku.");
    expect(voucherErrorMessage("NOT_APPLICABLE")).toBe("Kode promo tidak berlaku untuk tiket yang dipilih.");
    expect(voucherErrorMessage("MIN_QTY")).toBe("Jumlah tiket belum memenuhi syarat promo.");
    expect(voucherErrorMessage("MIN_SUBTOTAL")).toBe("Subtotal belum memenuhi syarat promo.");
    expect(voucherErrorMessage("EXHAUSTED")).toBe("Kuota promo sudah habis.");
    expect(voucherErrorMessage("SOMETHING_NEW")).toBe("Kode promo tidak bisa dipakai.");
  });
});
