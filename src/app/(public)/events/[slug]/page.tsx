import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { getEnv } from "@/lib/env";
import { FACILITIES } from "@/lib/facilities";
import { formatEventSchedule, formatRupiah } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import type { PublicEvent } from "@/lib/public/catalog-queries";
import { toPlainText } from "@/lib/rich-text";
import { SOCIAL_LINKS } from "@/lib/social-links";
import { EventTabs, type EventTab } from "./event-tabs";
import { loadEvent, publishedSlugParams } from "./load-event";
import { RefundDialog } from "./refund-dialog";

export const generateStaticParams = publishedSlugParams;
/** Unlisted slugs would otherwise get the fallback shell, committing a 200 before notFound()/permanentRedirect() run. */
export const ensureStatic = "navigation";
/** Reading params before any Suspense is deliberate (real 404/308), so navigations here are allowed to block. */
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/events/[slug]">): Promise<Metadata> {
  const event = await loadEvent((await params).slug);
  const title = event.seo.title || event.title;
  const description = event.seo.description || toPlainText(event.description) || `Tiket ${event.title}`;
  const url = `${getEnv().APP_URL}/events/${event.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      images: event.posterPath ? [{ url: mediaUrl(event.posterPath, "lg"), width: 1600 }] : undefined,
    },
  };
}

function jsonLd(event: PublicEvent): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.startsAt.toISOString(),
    endDate: event.endsAt.toISOString(),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: event.venue || event.city,
      address: { "@type": "PostalAddress", addressLocality: event.city, addressRegion: event.province, addressCountry: "ID" },
    },
    image: event.posterPath ? [mediaUrl(event.posterPath, "lg")] : undefined,
    description: toPlainText(event.description, 500) || undefined,
    offers:
      event.minPrice !== null
        ? { "@type": "AggregateOffer", lowPrice: event.minPrice, priceCurrency: "IDR", url: `${getEnv().APP_URL}/events/${event.slug}/tickets` }
        : undefined,
    organizer: event.organizerName ? { "@type": "Organization", name: event.organizerName } : undefined,
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function saleNote(event: PublicEvent): string {
  const labels = event.ticketCategories.map((c) => c.badge.label);
  if (labels.length === 0) return "Tiket belum tersedia.";
  if (labels.includes("Segera dibuka")) return "Penjualan tiket segera dibuka.";
  if (labels.every((l) => l === "Sold Out")) return "Tiket habis terjual.";
  return "Penjualan tiket ditutup.";
}

function tabsFor(event: PublicEvent): EventTab[] {
  const tabs: EventTab[] = [];
  if (event.description) {
    tabs.push({ key: "description", label: "Deskripsi", content: <div className="rich-text text-text" dangerouslySetInnerHTML={{ __html: event.description }} /> });
  }
  if (event.terms) {
    tabs.push({ key: "terms", label: "Syarat & Ketentuan", content: <div className="rich-text text-text" dangerouslySetInnerHTML={{ __html: event.terms }} /> });
  }
  const facilities = FACILITIES.filter((f) => event.facilities.includes(f.key));
  if (facilities.length > 0) {
    tabs.push({
      key: "facilities",
      label: "Fasilitas",
      content: (
        <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {facilities.map((f) => (
            <li key={f.key} className="flex items-center gap-2 text-text">
              <svg viewBox="0 0 20 20" className="size-5 shrink-0 text-success" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {f.label}
            </li>
          ))}
        </ul>
      ),
    });
  }
  return tabs;
}

export default async function EventPage({ params }: PageProps<"/events/[slug]">) {
  const event = await loadEvent((await params).slug);
  const schedule = formatEventSchedule(event.startsAt, event.endsAt, event.timezone);
  const buyable = event.ticketCategories.some((c) => c.badge.buyable);
  const socials = SOCIAL_LINKS.filter((s) => event.socialLinks[s.key]);
  const tabs = tabsFor(event);
  const place = [event.city, event.province].filter(Boolean).join(", ");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(event) }} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-10">
        <div className="flex min-w-0 flex-col gap-4">
          {event.posterPath && (
            <Image
              src={event.posterPath}
              alt={`Poster ${event.title}`}
              width={1600}
              height={900}
              sizes="(min-width: 1024px) 720px, 100vw"
              preload
              className="aspect-video w-full rounded-lg bg-surface-muted object-cover"
            />
          )}
          <Link href={`/events?category=${event.categorySlug}`} className="inline-flex min-h-11 items-center self-start">
            <Badge tone="accent">{event.categoryName}</Badge>
          </Link>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-text sm:text-3xl">{event.title}</h1>
          {event.organizerName && (
            <div className="flex items-center gap-3">
              {event.organizerLogoPath && (
                <Image src={event.organizerLogoPath} alt="" width={40} height={40} className="size-10 rounded-full border border-border object-cover" />
              )}
              <p className="text-sm text-muted">
                Diselenggarakan oleh <span className="font-semibold text-text">{event.organizerName}</span>
              </p>
            </div>
          )}
          {socials.length > 0 && (
            <ul aria-label="Media sosial penyelenggara" className="flex flex-wrap gap-x-4">
              {socials.map((s) => (
                <li key={s.key}>
                  <a
                    href={event.socialLinks[s.key]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block py-2 text-sm font-semibold text-accent-text underline-offset-4 hover:underline"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5 lg:sticky lg:top-6">
            <h2 className="text-lg font-bold text-text">Detail acara</h2>
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-muted">Tanggal</dt>
                <dd className="font-semibold text-text">{schedule.date}</dd>
              </div>
              <div>
                <dt className="text-muted">Waktu</dt>
                <dd className="font-semibold text-text">{schedule.time}</dd>
              </div>
              {(event.venue || place) && (
                <div>
                  <dt className="text-muted">Lokasi</dt>
                  <dd className="font-semibold text-text">
                    {event.venue}
                    {place && <span className="block font-normal text-muted">{place}</span>}
                  </dd>
                  {event.mapUrl && (
                    <a
                      href={event.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center font-semibold text-accent-text underline-offset-4 hover:underline"
                    >
                      Buka peta
                    </a>
                  )}
                </div>
              )}
            </dl>
            <div className="border-t border-border pt-4">
              {event.minPrice !== null && (
                <p className="text-sm text-muted">
                  Harga mulai dari
                  <span className="block text-2xl font-extrabold text-accent-text">{formatRupiah(event.minPrice)}</span>
                </p>
              )}
              {buyable ? (
                <Link href={`/events/${event.slug}/tickets`} className={`${buttonClass()} mt-4 w-full`}>
                  Pesan Sekarang
                </Link>
              ) : (
                <p className="mt-4 rounded-md bg-surface-muted px-3 py-2.5 text-sm font-semibold text-text">{saleNote(event)}</p>
              )}
            </div>
            {event.refundPolicy && <RefundDialog policy={event.refundPolicy} />}
          </div>
        </aside>

        {tabs.length > 0 && (
          <section aria-label="Informasi event" className="min-w-0">
            <EventTabs tabs={tabs} />
          </section>
        )}
      </div>
    </div>
  );
}
