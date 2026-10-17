import type { BadgeTone } from "@/components/ui/badge";

export const ORDER_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  awaiting_payment: { label: "Menunggu bayar", tone: "warning" },
  paid: { label: "Lunas", tone: "success" },
  expired: { label: "Kedaluwarsa", tone: "muted" },
  cancelled: { label: "Dibatalkan", tone: "muted" },
  late_paid_review: { label: "Perlu tindak lanjut", tone: "warning" },
  refunded: { label: "Dikembalikan", tone: "muted" },
};

export function formatAdminTime(at: string | Date): string {
  return `${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(at))} WIB`;
}
