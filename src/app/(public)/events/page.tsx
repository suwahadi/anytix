import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EventCard } from "@/components/event-card";
import { FocusOnMount } from "@/components/focus-on-mount";
import { buttonClass } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicCategories, getPublicCities, searchPublicEvents } from "@/lib/public/catalog-queries";
import { activeFilterCount, eventsHref, parseEventFilters, type PriceFilter, type WhenFilter } from "@/lib/public/event-filters";
import { EventFilterBar } from "./event-filter-bar";

export const metadata: Metadata = {
  title: "Jelajah event",
  description: "Daftar event yang tiketnya sedang atau akan dijual.",
};

const WHEN_PHRASE: Record<WhenFilter, string> = { "hari-ini": "hari ini", "pekan-ini": "dalam 7 hari ke depan", "bulan-ini": "dalam 30 hari ke depan" };
const PRICE_PHRASE: Record<PriceFilter, string> = {
  "di-bawah-100rb": "dengan harga di bawah Rp100.000",
  "100rb-500rb": "dengan harga Rp100.000 – Rp500.000",
  "di-atas-500rb": "dengan harga di atas Rp500.000",
};

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function ResultsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat event" className="flex flex-col gap-6">
      <Skeleton className="h-11 max-w-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-72" />
        ))}
      </div>
    </div>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/events">["searchParams"] }) {
  const params = await searchParams;
  const filters = parseEventFilters(params);
  const { q, page } = filters;
  const focusSearch = first(params.fokus) === "cari";
  const [result, categories, cities] = await Promise.all([
    searchPublicEvents({ ...filters, q: q || undefined, category: filters.category || undefined, city: filters.city || undefined }),
    getPublicCategories(),
    getPublicCities(),
  ]);
  const categoryName = categories.find((c) => c.slug === filters.category)?.name;
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const hrefFor = (p: number) => eventsHref({ ...filters, page: p });
  const filtered = Boolean(q || activeFilterCount(filters));

  return (
    <div className="flex flex-col gap-6">
      <EventFilterBar filters={filters} categories={categories} cities={cities} />
      {focusSearch && <FocusOnMount id="q" />}

      {result.items.length > 0 ? (
        <>
          <p className="text-sm text-muted" aria-live="polite">
            {result.total} event{filtered && " cocok"}
            {pages > 1 && ` · halaman ${Math.min(page, pages)} dari ${pages}`}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {result.items.map((event, i) => (
              <EventCard key={event.id} event={event} preload={i === 0} />
            ))}
          </div>
          {pages > 1 && (
            <nav aria-label="Halaman" className="flex items-center justify-between gap-4">
              {page > 1 ? (
                <Link href={hrefFor(page - 1)} className={buttonClass("secondary")}>
                  Sebelumnya
                </Link>
              ) : (
                <span />
              )}
              {page < pages && (
                <Link href={hrefFor(page + 1)} className={buttonClass("secondary")}>
                  Berikutnya
                </Link>
              )}
            </nav>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong px-4 py-10 text-center">
          {filtered ? (
            <>
              <p className="text-text">
                Tidak ada event
                {q && <> untuk &ldquo;{q}&rdquo;</>}
                {categoryName && <> di kategori {categoryName}</>}
                {filters.city && <> di {filters.city}</>}
                {filters.when && <> {WHEN_PHRASE[filters.when]}</>}
                {filters.price && <> {PRICE_PHRASE[filters.price]}</>}.
              </p>
              <Link href="/events" className={buttonClass("secondary")}>
                Hapus filter
              </Link>
            </>
          ) : (
            <p className="text-muted">Belum ada event yang dibuka. Cek lagi nanti.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function EventsPage({ searchParams }: PageProps<"/events">) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl">Jelajah event</h1>
      <Suspense fallback={<ResultsSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
