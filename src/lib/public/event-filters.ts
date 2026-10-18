export const WHEN_OPTIONS = [
  { value: "hari-ini", label: "Hari ini" },
  { value: "pekan-ini", label: "7 hari ke depan" },
  { value: "bulan-ini", label: "30 hari ke depan" },
] as const;

export const PRICE_OPTIONS = [
  { value: "di-bawah-100rb", label: "Di bawah Rp100.000", min: null, max: 100_000 },
  { value: "100rb-500rb", label: "Rp100.000 – Rp500.000", min: 100_000, max: 500_000 },
  { value: "di-atas-500rb", label: "Di atas Rp500.000", min: 500_000, max: null },
] as const;

export const SORT_OPTIONS = [
  { value: "terdekat", label: "Tanggal terdekat" },
  { value: "terbaru", label: "Baru ditambahkan" },
  { value: "termurah", label: "Harga terendah" },
  { value: "termahal", label: "Harga tertinggi" },
] as const;

export type WhenFilter = (typeof WHEN_OPTIONS)[number]["value"];
export type PriceFilter = (typeof PRICE_OPTIONS)[number]["value"];
export type SortOrder = (typeof SORT_OPTIONS)[number]["value"];

export type EventFilters = {
  q: string;
  category: string;
  city: string;
  when: WhenFilter | "";
  price: PriceFilter | "";
  sort: SortOrder;
  page: number;
};

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function pick<T extends string>(options: ReadonlyArray<{ value: T }>, value: string): T | undefined {
  return options.find((o) => o.value === value)?.value;
}

/** URL search params to filters; values outside the presets are ignored so a hand-edited URL never errors. */
export function parseEventFilters(params: Params): EventFilters {
  return {
    q: first(params.q),
    category: first(params.category),
    city: first(params.city),
    when: pick(WHEN_OPTIONS, first(params.waktu)) ?? "",
    price: pick(PRICE_OPTIONS, first(params.harga)) ?? "",
    sort: pick(SORT_OPTIONS, first(params.urut)) ?? "terdekat",
    page: Math.max(1, Number.parseInt(first(params.page), 10) || 1),
  };
}

export function eventsHref(filters: EventFilters): string {
  const search = new URLSearchParams();
  if (filters.q) search.set("q", filters.q);
  if (filters.category) search.set("category", filters.category);
  if (filters.city) search.set("city", filters.city);
  if (filters.when) search.set("waktu", filters.when);
  if (filters.price) search.set("harga", filters.price);
  if (filters.sort !== "terdekat") search.set("urut", filters.sort);
  if (filters.page > 1) search.set("page", String(filters.page));
  const s = search.toString();
  return s ? `/events?${s}` : "/events";
}

export function activeFilterCount(filters: EventFilters): number {
  return [filters.category, filters.city, filters.when, filters.price].filter(Boolean).length;
}
