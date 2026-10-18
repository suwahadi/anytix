import Image from "next/image";
import Link from "next/link";
import type { PublicCategory } from "@/lib/public/catalog-queries";

export function CategoryRow({ categories }: { categories: PublicCategory[] }) {
  return (
    <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:justify-between sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
      {categories.map((c) => (
        <li key={c.id} className="shrink-0">
          <Link href={`/events?category=${c.slug}`} className="group flex w-20 flex-col items-center gap-2 rounded-lg py-1 sm:w-24">
            <span className="relative flex size-16 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-xl font-extrabold text-accent-text transition-colors group-hover:bg-accent group-hover:text-on-accent">
              {c.icon ? <Image src={c.icon} alt="" fill sizes="64px" className="object-contain p-3" /> : <span aria-hidden>{c.name.slice(0, 1)}</span>}
            </span>
            <span className="max-w-full truncate rounded-full border border-border-strong px-3 py-1 text-xs font-semibold text-text group-hover:border-accent">
              {c.name}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
