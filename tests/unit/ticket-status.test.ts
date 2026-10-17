import { describe, expect, it } from "vitest";
import { ticketBadge } from "@/lib/ticket-status";

const now = new Date("2026-12-01T10:00:00Z");
const base = {
  status: "active",
  capacity: 100,
  sold: 0,
  held: 0,
  saleStartsAt: new Date("2026-11-01T00:00:00Z"),
  saleEndsAt: new Date("2026-12-20T00:00:00Z"),
  eventSaleStatus: "on_sale",
};

describe("ticketBadge", () => {
  it("On Sale with plenty left", () => {
    expect(ticketBadge(base, now)).toEqual({ label: "On Sale", tone: "accent", buyable: true, remaining: 100 });
  });

  it("closed event beats sold out", () => {
    expect(ticketBadge({ ...base, sold: 100, eventSaleStatus: "closed" }, now)).toMatchObject({ label: "Penjualan ditutup", buyable: false });
  });

  it("past sale end is closed", () => {
    expect(ticketBadge({ ...base, saleEndsAt: new Date("2026-11-30T00:00:00Z") }, now)).toMatchObject({ label: "Penjualan ditutup", tone: "muted" });
  });

  it("paused or not yet started shows Segera dibuka even when sold out", () => {
    expect(ticketBadge({ ...base, eventSaleStatus: "paused" }, now)).toMatchObject({ label: "Segera dibuka", buyable: false });
    expect(ticketBadge({ ...base, sold: 100, saleStartsAt: new Date("2026-12-05T00:00:00Z") }, now)).toMatchObject({ label: "Segera dibuka", buyable: false });
  });

  it("Sold Out counts held tickets", () => {
    expect(ticketBadge({ ...base, sold: 60, held: 40 }, now)).toEqual({ label: "Sold Out", tone: "muted", buyable: false, remaining: 0 });
  });

  it("Hampir habis uses max(10% of capacity, 10)", () => {
    expect(ticketBadge({ ...base, capacity: 50, sold: 45 }, now)).toMatchObject({ label: "Hampir habis", tone: "warning", buyable: true, remaining: 5 });
    expect(ticketBadge({ ...base, capacity: 1000, sold: 910 }, now)).toMatchObject({ label: "Hampir habis", remaining: 90 });
    expect(ticketBadge({ ...base, capacity: 1000, sold: 899 }, now)).toMatchObject({ label: "On Sale", remaining: 101 });
  });

  it("inactive category is not buyable", () => {
    expect(ticketBadge({ ...base, status: "hidden" }, now)).toMatchObject({ label: "Penjualan ditutup", buyable: false });
  });
});
