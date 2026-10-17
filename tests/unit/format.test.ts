import { describe, expect, it } from "vitest";
import { formatDateTime, formatEventSchedule, formatRupiah, toIsoFromLocal, toLocalInput } from "@/lib/format";

describe("timezone conversion for datetime-local inputs", () => {
  it("adds the fixed Indonesian offset", () => {
    expect(toIsoFromLocal("2026-12-20T19:00", "Asia/Jakarta")).toBe("2026-12-20T19:00:00+07:00");
    expect(toIsoFromLocal("2026-12-20T19:00", "Asia/Jayapura")).toBe("2026-12-20T19:00:00+09:00");
  });

  it("shows a UTC instant in the event timezone", () => {
    expect(toLocalInput("2026-12-20T12:00:00Z", "Asia/Makassar")).toBe("2026-12-20T20:00");
    expect(toLocalInput(new Date("2026-12-31T20:30:00Z"), "Asia/Jakarta")).toBe("2027-01-01T03:30");
  });

  it("round trips", () => {
    expect(toLocalInput(toIsoFromLocal("2026-03-05T08:15", "Asia/Jayapura"), "Asia/Jayapura")).toBe("2026-03-05T08:15");
  });
});

describe("formatRupiah", () => {
  it("uses Indonesian thousand separators without a space", () => {
    expect(formatRupiah(135000)).toBe("Rp135.000");
    expect(formatRupiah(1000)).toBe("Rp1.000");
    expect(formatRupiah(0)).toBe("Rp0");
  });
});

describe("formatEventSchedule", () => {
  it("same day in WITA", () => {
    expect(formatEventSchedule(new Date("2026-12-20T11:00:00Z"), new Date("2026-12-20T14:00:00Z"), "Asia/Makassar")).toEqual({
      date: "Minggu, 20 Desember 2026",
      time: "19.00 – 22.00 WITA",
    });
  });

  it("uses the event timezone to decide the day", () => {
    expect(formatEventSchedule(new Date("2026-12-19T17:30:00Z"), new Date("2026-12-19T20:00:00Z"), "Asia/Jakarta").date).toBe("Minggu, 20 Desember 2026");
  });

  it("two-day range lists both dates", () => {
    expect(formatEventSchedule(new Date("2026-12-19T12:00:00Z"), new Date("2026-12-20T15:00:00Z"), "Asia/Jakarta")).toEqual({
      date: "Sabtu, 19 Desember 2026 – Minggu, 20 Desember 2026",
      time: "19.00 – 22.00 WIB",
    });
  });
});

describe("formatDateTime", () => {
  it("shows day, date, time and zone label in the event timezone", () => {
    expect(formatDateTime(new Date("2026-12-01T03:19:00Z"), "Asia/Jakarta")).toBe("Selasa, 1 Desember 2026 pukul 10.19 WIB");
    expect(formatDateTime(new Date("2026-12-01T03:19:00Z"), "Asia/Makassar")).toBe("Selasa, 1 Desember 2026 pukul 11.19 WITA");
  });
});
