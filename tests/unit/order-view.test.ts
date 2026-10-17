import { describe, expect, it } from "vitest";
import { displayStatus } from "@/lib/booking/order-status";

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
