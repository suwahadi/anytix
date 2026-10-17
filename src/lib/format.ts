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
