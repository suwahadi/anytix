import Image from "next/image";
import Link from "next/link";
import { CalendarIcon } from "@/components/icons";
import { formatCardDate, formatRupiah } from "@/lib/format";
import type { PublicEventCard } from "@/lib/public/catalog-queries";

export function EventCard({ event, preload = false }: { event: PublicEventCard; preload?: boolean }) {
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-border-strong">
      <div className="relative aspect-video bg-surface-muted">
        {event.posterPath && (
          <Image
            src={event.posterPath}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            preload={preload}
            className="object-cover"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-base font-bold leading-snug text-text">
          <Link href={`/events/${event.slug}`} className="after:absolute after:inset-0 group-hover:underline">
            {event.title}
          </Link>
        </h3>
        <p className="flex items-start gap-1.5 text-sm text-muted">
          <CalendarIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            {formatCardDate(event.startsAt, event.endsAt, event.timezone)}
            {event.city && <> · {event.city}</>}
          </span>
        </p>
        <p className="text-sm text-text">
          {event.minPrice !== null ? (
            <>
              Mulai dari <strong className="text-base font-extrabold text-accent-text">{formatRupiah(event.minPrice)}</strong>
            </>
          ) : (
            <span className="text-muted">Harga belum tersedia</span>
          )}
        </p>
        {event.organizerName && (
          <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
            <span className="relative size-7 shrink-0 overflow-hidden rounded-full bg-surface-muted">
              {event.organizerLogoPath ? (
                <Image src={event.organizerLogoPath} alt="" fill sizes="28px" className="object-cover" />
              ) : (
                <span aria-hidden className="flex size-full items-center justify-center text-xs font-bold text-muted">
                  {event.organizerName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </span>
            <span className="truncate text-sm text-muted">{event.organizerName}</span>
          </div>
        )}
      </div>
    </article>
  );
}
