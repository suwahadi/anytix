import Form from "next/form";
import Link from "next/link";
import { EventCard } from "@/components/event-card";
import { buttonClass } from "@/components/ui/button";
import { getHomeEvents, getPublicCategories } from "@/lib/public/catalog-queries";

export default async function Home() {
  const [{ featured, upcoming }, categories] = await Promise.all([getHomeEvents(), getPublicCategories()]);
  const withEvents = categories.filter((c) => c.eventCount > 0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-6 sm:gap-12 sm:py-10">
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl">Cari event, beli tiket tanpa daftar akun</h1>
        <Form action="/events" role="search" className="flex max-w-xl gap-2">
          <label htmlFor="home-q" className="sr-only">
            Cari event
          </label>
          <input
            id="home-q"
            name="q"
            type="search"
            placeholder="Nama event, kota, atau venue"
            className="h-11 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 text-base text-text placeholder:text-muted"
          />
          <button type="submit" className={buttonClass()}>
            Cari
          </button>
        </Form>
      </section>

      {featured.length > 0 && (
        <section aria-labelledby="featured-heading" className="flex flex-col gap-4">
          <h2 id="featured-heading" className="text-xl font-bold text-text">
            Event pilihan
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((event, i) => (
              <EventCard key={event.id} event={event} preload={i === 0} />
            ))}
          </div>
        </section>
      )}

      {withEvents.length > 0 && (
        <section aria-labelledby="categories-heading" className="flex flex-col gap-3">
          <h2 id="categories-heading" className="text-xl font-bold text-text">
            Kategori
          </h2>
          <ul className="flex flex-wrap gap-2">
            {withEvents.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/events?category=${c.slug}`}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-border-strong bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-muted"
                >
                  {c.name}
                  <span className="text-muted">{c.eventCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="upcoming-heading" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="upcoming-heading" className="text-xl font-bold text-text">
            Event terdekat
          </h2>
          {upcoming.length > 0 && (
            <Link href="/events" className="py-2 text-sm font-semibold text-accent-text underline-offset-4 hover:underline">
              Lihat semua
            </Link>
          )}
        </div>
        {upcoming.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {upcoming.map((event, i) => (
              <EventCard key={event.id} event={event} preload={featured.length === 0 && i === 0} />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border-strong px-4 py-10 text-center text-muted">
            Belum ada event yang dibuka. Cek lagi nanti.
          </p>
        )}
      </section>
    </div>
  );
}
