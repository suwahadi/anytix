import Image from "next/image";
import Link from "next/link";
import { BallIcon, FrameIcon, MaskIcon, MicIcon, MountainIcon, MusicIcon, TicketIcon, ToolIcon, TrophyIcon } from "@/components/icons";
import type { PublicCategory } from "@/lib/public/catalog-queries";

/** Fallback glyphs for categories the admin has not given an icon yet, matched on common Indonesian and English names. */
const GLYPHS = [
  { match: /musik|music|konser|concert/, Icon: MusicIcon },
  { match: /pameran|exhibit|seni|art|galeri/, Icon: FrameIcon },
  { match: /teater|theat|drama|pertunjukan/, Icon: MaskIcon },
  { match: /olahraga|sport|lari|run/, Icon: BallIcon },
  { match: /wisata|travel|tour|trip/, Icon: MountainIcon },
  { match: /talk|seminar|konferensi|conference/, Icon: MicIcon },
  { match: /workshop|kelas|class|pelatihan/, Icon: ToolIcon },
  { match: /kompetisi|lomba|competition|turnamen/, Icon: TrophyIcon },
];

function glyphFor(c: PublicCategory) {
  const key = `${c.slug} ${c.name}`.toLowerCase();
  return GLYPHS.find((g) => g.match.test(key))?.Icon ?? TicketIcon;
}

export function CategoryRow({ categories }: { categories: PublicCategory[] }) {
  return (
    <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
      {categories.map((c) => {
        const Glyph = glyphFor(c);
        return (
          <li key={c.id} className="w-32 shrink-0 snap-start lg:w-auto">
            <Link
              href={`/events?category=${c.slug}`}
              className="group flex h-full flex-col items-center gap-3 rounded-xl border border-border bg-surface px-3 py-5 text-center transition-colors hover:border-accent hover:bg-accent-soft"
            >
              <span className="relative flex size-12 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-accent-text transition-colors group-hover:bg-accent group-hover:text-on-accent">
                {c.icon ? <Image src={c.icon} alt="" fill sizes="48px" className="object-contain p-2.5" /> : <Glyph className="size-6" />}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-text">{c.name}</span>
                <span className="text-xs text-muted">{c.eventCount > 0 ? `${c.eventCount} event` : "Belum ada event"}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
