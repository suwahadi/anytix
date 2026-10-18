import Image from "next/image";
import Link from "next/link";
import type { HeroSlide } from "@/lib/public/hero-slides";

const FRAME = "relative block aspect-[16/9] overflow-hidden rounded-xl bg-stone-900 sm:aspect-[3/1]";

/** Wide banner. Event posters are 16:9, so on wide frames the whole poster sits centred over its own blurred copy instead of being cropped. */
export function PosterBanner({ slide, preload = false, caption = false }: { slide: HeroSlide; preload?: boolean; caption?: boolean }) {
  if (slide.kind === "generic") {
    return (
      <Link href={slide.href} aria-label={slide.title} className={FRAME}>
        <Image src={slide.imageUrl} alt={slide.alt} fill sizes="(min-width: 1024px) 1100px, 100vw" preload={preload} className="object-cover" />
        <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-stone-950/85 via-stone-950/55 to-transparent" />
        <span className="absolute inset-y-0 left-0 flex max-w-md flex-col justify-center gap-2 p-6 sm:p-10">
          <span className="text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">{slide.title}</span>
          <span className="text-sm text-stone-100 sm:text-base">{slide.subtitle}</span>
          <span className="mt-2 inline-flex w-fit rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent">Lihat semua event</span>
        </span>
      </Link>
    );
  }
  return (
    <Link href={slide.href} aria-label={slide.title} className={FRAME}>
      <Image
        src={slide.posterPath}
        alt=""
        fill
        sizes="(min-width: 1024px) 1100px, 100vw"
        className="hidden scale-125 object-cover blur-2xl brightness-[.65] sm:block"
      />
      <span className="absolute inset-0 sm:left-1/2 sm:right-auto sm:aspect-[16/9] sm:h-full sm:-translate-x-1/2">
        <Image src={slide.posterPath} alt={slide.title} fill sizes="(min-width: 640px) 60vw, 100vw" preload={preload} className="object-cover" />
      </span>
      {caption && (
        <span className="absolute inset-x-0 bottom-3 flex justify-center px-4">
          <span className="max-w-full truncate rounded-full bg-stone-950/80 px-4 py-1.5 text-sm font-semibold text-white">{slide.title}</span>
        </span>
      )}
    </Link>
  );
}
