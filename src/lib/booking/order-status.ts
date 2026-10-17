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

/** Poll until the database status is final: a settlement may still arrive in the grace window after the deadline. */
export function shouldPoll(status: string): boolean {
  return status === "awaiting_payment";
}

/** Past the deadline but not yet finalized by the worker: shown as expired, while a late settlement can still turn it paid. */
export function isFinalizing(status: string, display: DisplayStatus): boolean {
  return status === "awaiting_payment" && display === "KEDALUWARSA";
}
