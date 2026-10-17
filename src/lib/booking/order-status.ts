export type DisplayStatus = "PENDING" | "LUNAS" | "KEDALUWARSA" | "DIBATALKAN" | "DITINJAU" | "DIKEMBALIKAN";

/** An unpaid order past its deadline already reads as expired while the worker finalizes it (design doc §3.3). */
export function displayStatus(status: string, payExpiresAt: Date, now: Date): DisplayStatus {
  switch (status) {
    case "awaiting_payment":
      return now >= payExpiresAt ? "KEDALUWARSA" : "PENDING";
    case "paid":
      return "LUNAS";
    case "cancelled":
      return "DIBATALKAN";
    case "late_paid_review":
      return "DITINJAU";
    case "refunded":
      return "DIKEMBALIKAN";
    default:
      return "KEDALUWARSA";
  }
}
