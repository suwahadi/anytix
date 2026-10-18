import type { Timezone } from "@/lib/validation/catalog";

/** Indonesia has no daylight saving time, so these offsets are exact all year. */
export const TIMEZONES: Record<Timezone, { label: string; offset: string; hours: number }> = {
  "Asia/Jakarta": { label: "WIB", offset: "+07:00", hours: 7 },
  "Asia/Makassar": { label: "WITA", offset: "+08:00", hours: 8 },
  "Asia/Jayapura": { label: "WIT", offset: "+09:00", hours: 9 },
};

export function toIsoFromLocal(local: string, tz: Timezone): string {
  return `${local.slice(0, 16)}:00${TIMEZONES[tz].offset}`;
}

export function toLocalInput(value: string | Date, tz: Timezone): string {
  const shifted = new Date(new Date(value).getTime() + TIMEZONES[tz].hours * 3_600_000);
  return shifted.toISOString().slice(0, 16);
}

export function formatRupiah(amount: number): string {
  return `Rp${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amount)}`;
}

export function formatEventSchedule(startsAt: Date, endsAt: Date, tz: Timezone): { date: string; time: string } {
  const day = new Intl.DateTimeFormat("id-ID", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const clock = new Intl.DateTimeFormat("id-ID", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const startDay = day.format(startsAt);
  const endDay = day.format(endsAt);
  return {
    date: startDay === endDay ? startDay : `${startDay} – ${endDay}`,
    time: `${clock.format(startsAt)} – ${clock.format(endsAt)} ${TIMEZONES[tz].label}`,
  };
}

/** Short card date: "20 Desember 2026", "7 – 8 November 2026", "30 Nov – 1 Des 2026". */
export function formatCardDate(startsAt: Date, endsAt: Date, tz: Timezone): string {
  const parts = (at: Date) => {
    const get = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { timeZone: tz, ...opts }).format(at);
    return { day: get({ day: "numeric" }), long: get({ month: "long" }), short: get({ month: "short" }).replace(".", ""), year: get({ year: "numeric" }) };
  };
  const a = parts(startsAt);
  const b = parts(endsAt);
  if (a.year !== b.year) return `${a.day} ${a.short} ${a.year} – ${b.day} ${b.short} ${b.year}`;
  if (a.long !== b.long) return `${a.day} ${a.short} – ${b.day} ${b.short} ${b.year}`;
  if (a.day !== b.day) return `${a.day} – ${b.day} ${b.long} ${b.year}`;
  return `${a.day} ${a.long} ${a.year}`;
}

export function formatDateTime(at: Date, tz: Timezone): string {
  const day = new Intl.DateTimeFormat("id-ID", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const clock = new Intl.DateTimeFormat("id-ID", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${day.format(at)} pukul ${clock.format(at)} ${TIMEZONES[tz].label}`;
}
