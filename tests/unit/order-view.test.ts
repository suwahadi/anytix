import { describe, expect, it } from "vitest";
import { displayStatus, isFinalizing, shouldPoll } from "@/lib/booking/order-status";

const deadline = new Date("2026-12-01T10:15:00Z");
const before = new Date("2026-12-01T10:14:59Z");
const after = new Date("2026-12-01T10:15:01Z");

describe("displayStatus", () => {
  it("awaiting payment is PENDING until the deadline, then KEDALUWARSA", () => {
    expect(displayStatus("awaiting_payment", deadline, before)).toBe("PENDING");
    expect(displayStatus("awaiting_payment", deadline, after)).toBe("KEDALUWARSA");
  });

  it("final statuses ignore the clock", () => {
    expect(displayStatus("paid", deadline, after)).toBe("LUNAS");
    expect(displayStatus("expired", deadline, before)).toBe("KEDALUWARSA");
    expect(displayStatus("cancelled", deadline, before)).toBe("DIBATALKAN");
    expect(displayStatus("late_paid_review", deadline, after)).toBe("DITINJAU");
    expect(displayStatus("refunded", deadline, after)).toBe("DIKEMBALIKAN");
  });
});

describe("order page polling", () => {
  it("keeps polling past the deadline while the order is still awaiting payment", () => {
    expect(shouldPoll("awaiting_payment")).toBe(true);
    expect(isFinalizing("awaiting_payment", displayStatus("awaiting_payment", deadline, after))).toBe(true);
    expect(isFinalizing("awaiting_payment", displayStatus("awaiting_payment", deadline, before))).toBe(false);
  });

  it("stops polling once the order is final", () => {
    for (const s of ["paid", "expired", "cancelled", "late_paid_review", "refunded"]) {
      expect(shouldPoll(s)).toBe(false);
      expect(isFinalizing(s, displayStatus(s, deadline, after))).toBe(false);
    }
  });
});
