import Link from "next/link";
import { Carousel } from "@/components/carousel";
import { CategoryRow } from "@/components/category-row";
import { EventCard } from "@/components/event-card";
import { PosterBanner } from "@/components/poster-banner";
import { buttonClass } from "@/components/ui/button";
import { getHomeEvents, getPublicCategories, getPublicSite } from "@/lib/public/catalog-queries";
import { buildHeroSlides, type EventSlide } from "@/lib/public/hero-slides";

const CARD_ITEM = "w-[78%] sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-3rem)/4)]";

function SectionTitle({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="text-xl font-bold tracking-tight text-text sm:text-2xl">
      {children}
    </h2>
  );
}

export default async function Home() {
  const [{ featured, bestSellers, upcoming }, categories, site] = await Promise.all([getHomeEvents(), getPublicCategories(), getPublicSite()]);
  const hero = buildHeroSlides(featured);
  const recommended = featured.length > 0 ? featured : upcoming;
  const laris: EventSlide[] = buildHeroSlides(bestSellers, 0).filter((s): s is EventSlide => s.kind === "event");

  return (
    <div className="flex flex-col pb-14">
      <h1 className="sr-only">{site.name}: tiket event tanpa daftar akun</h1>

      <section aria-label="Event pilihan" className="mx-auto w-full max-w-6xl px-4 pt-5 sm:pt-8">
        <Carousel
          label="Event pilihan"
          center
          dots
          autoplayMs={6000}
          itemClassName="w-(--slide) [--slide:100%] sm:[--slide:88%]"
          items={hero.map((slide, i) => <PosterBanner key={slide.key} slide={slide} preload={i === 0} />)}
        />
      </section>

      {recommended.length > 0 && (
        <section aria-labelledby="rekomendasi-heading" className="mx-auto mt-10 flex w-full max-w-6xl flex-col gap-4 px-4">
          <SectionTitle id="rekomendasi-heading">Rekomendasi Event</SectionTitle>
          <Carousel
            label="Rekomendasi event"
            itemClassName={CARD_ITEM}
            items={recommended.map((event) => <EventCard key={event.id} event={event} />)}
          />
        </section>
      )}

      {laris.length > 0 && (
        <section aria-labelledby="laris-heading" className="mt-14 bg-surface-muted py-10">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4">
            <div className="text-center">
              <SectionTitle id="laris-heading">Laris Manis</SectionTitle>
              <p className="mt-1 text-muted">Event yang paling banyak dipesan saat ini.</p>
            </div>
            <Carousel
              label="Event laris"
              center
              dots
              itemClassName="w-(--slide) [--slide:100%] sm:[--slide:72%]"
              items={laris.map((slide) => <PosterBanner key={slide.key} slide={slide} caption />)}
            />
          </div>
        </section>
      )}

      {categories.length > 0 && (
        <section aria-labelledby="kategori-heading" className="mx-auto mt-12 flex w-full max-w-6xl flex-col gap-4 px-4">
          <SectionTitle id="kategori-heading">Kategori Event</SectionTitle>
          <CategoryRow categories={categories} />
        </section>
      )}

      <section aria-labelledby="terdekat-heading" className="mx-auto mt-12 flex w-full max-w-6xl flex-col gap-4 px-4">
        <SectionTitle id="terdekat-heading">Event Terdekat</SectionTitle>
        {upcoming.length > 0 ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {upcoming.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
            <Link href="/events" className={`${buttonClass("secondary")} mx-auto mt-2 rounded-full px-6`}>
              Lihat Lainnya
            </Link>
          </>
        ) : (
          <p className="rounded-lg border border-dashed border-border-strong px-4 py-10 text-center text-muted">Belum ada event yang dibuka. Cek lagi nanti.</p>
        )}
      </section>
    </div>
  );
}
