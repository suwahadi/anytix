import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { EventCard } from "@/components/event-card";
import { buttonClass } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicCategories, searchPublicEvents } from "@/lib/public/catalog-queries";

export const metadata: Metadata = {
  title: "Jelajah event",
  description: "Daftar event yang tiketnya sedang atau akan dijual.",
};

const fieldClass = "h-11 min-w-0 rounded-md border border-border-strong bg-surface px-3 text-base text-text";

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
  const q = first(params.q);
  const category = first(params.category);
  const page = Math.max(1, Number.parseInt(first(params.page), 10) || 1);
  const [result, categories] = await Promise.all([
    searchPublicEvents({ q: q || undefined, category: category || undefined, page }),
    getPublicCategories(),
  ]);
  const categoryName = categories.find((c) => c.slug === category)?.name;
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const hrefFor = (p: number) => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (category) search.set("category", category);
    if (p > 1) search.set("page", String(p));
    const s = search.toString();
    return s ? `/events?${s}` : "/events";
  };
  const filtered = Boolean(q || category);

  return (
    <div className="flex flex-col gap-6">
      <Form action="/events" role="search" className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="q" className="text-sm font-medium text-text">
            Cari
          </label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Nama event, kota, atau venue" className={`${fieldClass} placeholder:text-muted`} />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-56">
          <label htmlFor="category" className="text-sm font-medium text-text">
            Kategori
          </label>
          <select id="category" name="category" defaultValue={category} className={fieldClass}>
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonClass()}>
          Terapkan
        </button>
      </Form>

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
                {categoryName && <> di kategori {categoryName}</>}.
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
