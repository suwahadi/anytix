export type GenericSlide = { kind: "generic"; key: string; href: "/events"; title: string; subtitle: string; imageUrl: string; alt: string };
export type EventSlide = { kind: "event"; key: string; href: string; title: string; posterPath: string };
export type HeroSlide = EventSlide | GenericSlide;

const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=80`;

/** Fill-in banners for a thin catalogue: honest invitations to browse, never invented events, prices or dates. */
export const GENERIC_BANNERS: ReadonlyArray<GenericSlide> = [
  {
    kind: "generic",
    key: "generic-concert",
    href: "/events",
    title: "Jelajahi event di {site}",
    subtitle: "Beli tiket tanpa daftar akun, e-ticket langsung ke email.",
    imageUrl: unsplash("1514525253161-7a46d19cd819"),
    alt: "Panggung konser dengan lampu warna-warni di atas penonton",
  },
  {
    kind: "generic",
    key: "generic-theatre",
    href: "/events",
    title: "Konser, teater, pameran",
    subtitle: "Pilih tiket, bayar lewat QRIS atau transfer bank.",
    imageUrl: unsplash("1503095396549-807759245b35"),
    alt: "Siluet tiga penampil di depan tirai panggung merah",
  },
  {
    kind: "generic",
    key: "generic-hall",
    href: "/events",
    title: "Satu QR untuk satu orang",
    subtitle: "Tunjukkan e-ticket di pintu masuk, dari layar atau cetakan.",
    imageUrl: unsplash("1531058020387-3be344556be6"),
    alt: "Penonton di aula acara menghadap layar besar",
  },
];

export function buildHeroSlides(
  featured: ReadonlyArray<{ slug: string; title: string; posterPath: string | null }>,
  { siteName, min = 3, max = 6 }: { siteName: string; min?: number; max?: number },
): HeroSlide[] {
  const events: HeroSlide[] = featured
    .filter((e): e is { slug: string; title: string; posterPath: string } => Boolean(e.posterPath))
    .slice(0, max)
    .map((e) => ({ kind: "event", key: `event-${e.slug}`, href: `/events/${e.slug}`, title: e.title, posterPath: e.posterPath }));
  const banners = GENERIC_BANNERS.slice(0, Math.max(0, min - events.length)).map((b) => ({ ...b, title: b.title.replace("{site}", siteName) }));
  return [...events, ...banners];
}
