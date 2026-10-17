import type { Metadata } from "next";
import Link from "next/link";
import { formatEventSchedule } from "@/lib/format";
import { loadEvent, publishedSlugParams } from "../load-event";
import { TicketPicker } from "./ticket-picker";

export const generateStaticParams = publishedSlugParams;
/** Unlisted slugs would otherwise get the fallback shell, committing a 200 before notFound()/permanentRedirect() run. */
export const ensureStatic = "navigation";
/** Reading params before any Suspense is deliberate (real 404/308), so navigations here are allowed to block. */
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/events/[slug]/tickets">): Promise<Metadata> {
  const event = await loadEvent((await params).slug, "/tickets");
  return { title: `Pilih tiket ${event.title}`, description: `Kategori dan harga tiket ${event.title}.` };
}

export default async function TicketsPage({ params }: PageProps<"/events/[slug]/tickets">) {
  const event = await loadEvent((await params).slug, "/tickets");
  const schedule = formatEventSchedule(event.startsAt, event.endsAt, event.timezone);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:py-10">
      <div className="flex flex-col gap-1">
        <Link href={`/events/${event.slug}`} className="self-start py-2 text-sm font-semibold text-accent-text underline-offset-4 hover:underline">
          ← Kembali ke detail event
        </Link>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-text sm:text-3xl">{event.title}</h1>
        <p className="text-sm text-muted">
          {schedule.date} · {schedule.time}
          {event.city && <> · {event.city}</>}
        </p>
      </div>
      <TicketPicker
        slug={event.slug}
        categories={event.ticketCategories.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          price: c.price,
          maxPerOrder: c.maxPerOrder,
          admitsPerUnit: c.admitsPerUnit,
          hasMerchandise: c.hasMerchandise,
          badge: c.badge,
        }))}
      />
    </div>
  );
}
