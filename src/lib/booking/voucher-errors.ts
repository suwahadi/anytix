const MESSAGES: Record<string, string> = {
  NOT_FOUND: "Kode promo tidak ditemukan.",
  INACTIVE: "Kode promo sedang tidak berlaku.",
  NOT_STARTED: "Kode promo sedang tidak berlaku.",
  ENDED: "Kode promo sedang tidak berlaku.",
  NOT_APPLICABLE: "Kode promo tidak berlaku untuk tiket yang dipilih.",
  MIN_QTY: "Jumlah tiket belum memenuhi syarat promo.",
  MIN_SUBTOTAL: "Subtotal belum memenuhi syarat promo.",
  EXHAUSTED: "Kuota promo sudah habis.",
};

/** Buyer-facing text for a `compute_quote` voucher error code. */
export function voucherErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? "Kode promo tidak bisa dipakai.";
}
