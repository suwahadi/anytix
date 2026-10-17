export type TicketBadge = {
  label: "On Sale" | "Hampir habis" | "Sold Out" | "Segera dibuka" | "Penjualan ditutup";
  tone: "accent" | "warning" | "muted";
  buyable: boolean;
  remaining: number;
};

export type TicketBadgeInput = {
  status: string;
  capacity: number;
  sold: number;
  held: number;
  saleStartsAt: Date;
  saleEndsAt: Date;
  eventSaleStatus: string;
};

export function ticketBadge(input: TicketBadgeInput, now: Date): TicketBadge {
  const remaining = Math.max(0, input.capacity - input.sold - input.held);
  if (input.status !== "active" || input.eventSaleStatus === "closed" || now > input.saleEndsAt) {
    return { label: "Penjualan ditutup", tone: "muted", buyable: false, remaining };
  }
  if (input.eventSaleStatus === "paused" || now < input.saleStartsAt) {
    return { label: "Segera dibuka", tone: "muted", buyable: false, remaining };
  }
  if (remaining === 0) return { label: "Sold Out", tone: "muted", buyable: false, remaining };
  if (remaining <= Math.max(input.capacity * 0.1, 10)) return { label: "Hampir habis", tone: "warning", buyable: true, remaining };
  return { label: "On Sale", tone: "accent", buyable: true, remaining };
}
