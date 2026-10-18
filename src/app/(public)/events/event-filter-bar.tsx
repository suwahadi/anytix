"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { FilterIcon, SearchIcon, SortIcon } from "@/components/icons";
import type { PublicCategory } from "@/lib/public/catalog-queries";
import { activeFilterCount, eventsHref, parseEventFilters, PRICE_OPTIONS, SORT_OPTIONS, WHEN_OPTIONS, type EventFilters } from "@/lib/public/event-filters";
import { useWide } from "@/lib/use-wide";

const FIELD = "h-11 w-full min-w-0 rounded-md border border-border-strong bg-surface px-3 text-base text-text";

function Choice({ id, name, label, value, all, options }: { id: string; name: string; label: string; value: string; all: string; options: ReadonlyArray<{ value: string; label: string }> }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      <select id={id} name={name} defaultValue={value} className={FIELD}>
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Selects apply on change, the search text on Enter; the form still submits as a plain GET without JavaScript. */
export function EventFilterBar({ filters, categories, cities }: { filters: EventFilters; categories: PublicCategory[]; cities: string[] }) {
  const router = useRouter();
  const uid = useId();
  const active = activeFilterCount(filters);
  const [open, setOpen] = useState(active > 0);
  const wide = useWide();

  function apply(form: HTMLFormElement) {
    const data = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v)]));
    router.push(eventsHref({ ...parseEventFilters(data), page: 1 }), { scroll: false });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    apply(e.currentTarget);
  }

  function onChange(e: FormEvent<HTMLFormElement>) {
    if (e.target instanceof HTMLSelectElement) apply(e.currentTarget);
  }

  const cleared = eventsHref({ ...filters, category: "", city: "", when: "", price: "", page: 1 });

  return (
    <form key={eventsHref(filters)} action="/events" role="search" onSubmit={onSubmit} onChange={onChange} className="flex flex-col gap-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={`${uid}-panel`}
          title="Filter"
          className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-md border border-border-strong bg-surface text-sm font-semibold text-text hover:bg-surface-muted aria-expanded:bg-surface-muted sm:w-auto sm:px-4"
        >
          <FilterIcon className="size-[18px] sm:size-4" />
          <span className="max-sm:sr-only">Filter</span>
          {active > 0 && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-on-accent max-sm:absolute max-sm:-right-1.5 max-sm:-top-1.5">
              {active}
              <span className="sr-only"> filter aktif</span>
            </span>
          )}
        </button>
        <div className="relative min-w-0 flex-1">
          <label htmlFor="q" className="sr-only">
            Cari event
          </label>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
          <input
            id="q"
            name="q"
            type="search"
            enterKeyHint="search"
            defaultValue={filters.q}
            placeholder={wide ? "Cari nama event, kota, atau venue" : "Cari..."}
            className={`${FIELD} text-ellipsis pl-10 placeholder:text-muted`}
          />
        </div>
        <div className="relative w-[7.5rem] shrink-0 sm:w-40">
          <label htmlFor={`${uid}-sort`} className="sr-only">
            Urutkan
          </label>
          <SortIcon className="pointer-events-none absolute left-3 top-1/2 hidden size-4 -translate-y-1/2 text-muted sm:block" />
          <select id={`${uid}-sort`} name="urut" defaultValue={filters.sort} className={`${FIELD} sm:pl-9`}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div id={`${uid}-panel`} className={`${open ? "grid" : "hidden"} gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4`}>
        <Choice id={`${uid}-city`} name="city" label="Lokasi" value={filters.city} all="Semua lokasi" options={cities.map((c) => ({ value: c, label: c }))} />
        <Choice
          id={`${uid}-category`}
          name="category"
          label="Kategori"
          value={filters.category}
          all="Semua kategori"
          options={categories.map((c) => ({ value: c.slug, label: c.name }))}
        />
        <Choice id={`${uid}-when`} name="waktu" label="Waktu" value={filters.when} all="Kapan saja" options={WHEN_OPTIONS} />
        <Choice id={`${uid}-price`} name="harga" label="Harga" value={filters.price} all="Semua harga" options={PRICE_OPTIONS} />
        {active > 0 && (
          <Link href={cleared} scroll={false} className="inline-flex min-h-11 items-center justify-self-start text-sm font-semibold text-accent-text underline-offset-4 hover:underline sm:col-span-2 lg:col-span-4">
            Hapus filter
          </Link>
        )}
      </div>
    </form>
  );
}
