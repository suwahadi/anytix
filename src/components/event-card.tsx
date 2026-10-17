import Image from "next/image";
import Link from "next/link";
import { formatEventSchedule, formatRupiah } from "@/lib/format";
import type { PublicEventCard } from "@/lib/public/catalog-queries";

export function EventCard({ event, preload = false }: { event: PublicEventCard; preload?: boolean }) {
  const schedule = formatEventSchedule(event.startsAt, event.endsAt, event.timezone);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <div className="aspect-video bg-surface-muted">
        {event.posterPath && (
          <Image
            src={event.posterPath}
            alt=""
            width={800}
            height={450}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            preload={preload}
            className="size-full object-cover"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <p className="text-xs font-semibold text-muted">{event.categoryName}</p>
        <h3 className="text-base font-bold leading-snug text-text">
          <Link href={`/events/${event.slug}`} className="after:absolute after:inset-0 group-hover:underline">
            {event.title}
          </Link>
        </h3>
        <p className="text-sm text-muted">
          {schedule.date}
          {event.city && <> · {event.city}</>}
        </p>
        <p className="mt-auto pt-2 text-sm text-text">
          {event.minPrice !== null ? (
            <>
              Mulai dari <strong className="font-bold text-accent-text">{formatRupiah(event.minPrice)}</strong>
            </>
          ) : (
            <span className="text-muted">Harga belum tersedia</span>
          )}
        </p>
        {event.organizerName && <p className="truncate text-xs text-muted">{event.organizerName}</p>}
      </div>
    </article>
  );
}
