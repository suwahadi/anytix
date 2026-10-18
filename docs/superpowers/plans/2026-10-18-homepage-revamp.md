# Homepage Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The public header, footer and homepage follow the artatix.co.id structure with Anytix's own identity. The structure runs: pill nav; hero poster slider; Rekomendasi carousel; Laris Manis banner carousel; category row; 4×2 Event Terdekat grid; four-column footer with copyright. Everything uses real data only, and the pages that are not built yet carry a "Segera" marker.

**Architecture:** Server components fetch through cached catalog queries (`PUBLIC_CACHE`) and pass plain props to small client components. Those client components only handle scrolling, arrows, dots and autoplay. One generic `Carousel` client component powers the hero, Rekomendasi and Laris Manis. Pure helpers (hero slide assembly, nav model, autoplay decision) carry the unit tests; DB tests cover the new queries; Playwright covers the rest.

**Tech Stack:** Next.js 16.4 (cacheComponents, partialPrefetching), React 19, Tailwind v4 tokens in `src/app/globals.css`, postgres.js, vitest.

**Spec:** `docs/superpowers/specs/2026-10-18-homepage-revamp-design.md` (plus `PRD.md` §8/§17 and `docs/superpowers/specs/2026-10-17-anytix-mvp-design.md`).

## Global Constraints

- **Code style:**
  - AGENTS.md: no annotation comments; only JSDoc or comments for non-obvious logic.
  - `cursor: pointer` on every link and button (global base layer already does it; keep it working).
  - English code, Indonesian UI copy.
- **Antislop:** active in AFTER mode (session override). Write `anti-slop/audit-004-2026-10-18.md`, run the Delivery Gate, and fix only owner-approved items.
- **Content rules:**
  - No fabricated events, prices, dates, statistics or testimonials.
  - No `#` links. Pages that do not exist render as non-interactive text with a visible "Segera" marker.
  - Social icons are hidden (no URLs exist).
- **Identity:**
  - Neutral `stone` palette, one accent `#C2410C` (`accent` tokens), Plus Jakarta Sans. Do not copy Artatix blue.
  - Dials: ENERGY 1 / RHYTHM 2, with MOTION 2 on the homepage only.
- **Motion:**
  - Slide transitions are 300 ms.
  - Autoplay runs every 6 s and pauses on hover, focus, touch or the pause button.
  - Nothing autoplays or animates under `prefers-reduced-motion: reduce`.
- **Accessibility and touch:** WCAG AA contrast in both themes, tap targets ≥ 44 px, keyboard-operable carousels, a visible pause control for the autoplaying hero (WCAG 2.2.2), and an `sr-only` `h1` on the homepage.
- **Images:**
  - Event images keep going through `next/image` with the existing custom loader (absolute URLs pass through unchanged).
  - Generic banners use fixed `https://images.unsplash.com/photo-…?auto=format&fit=crop&w=1600&q=80` URLs, and `img-src` in `next.config.ts` gains `https://images.unsplash.com`.
- **Dependencies:** no new runtime dependencies. Icons are inline SVG with a 2 px stroke, matching `theme-toggle.tsx`.

## Review Focus

1. **The catalog has 0 or 1 published events.** Rekomendasi, Laris Manis and Event Terdekat hide or degrade cleanly, carousels show no arrows and no dots, and the hero still shows 3 slides (generic banners). Tests: Task 1 `hero falls back to generic banners`, Task 2 `best sellers empty without sales`, plus the Task 8 browser step with the real one-event dev DB.
2. **A featured event has no poster.** It is skipped in the hero (never an empty grey slide), while the card still renders with a neutral tile. Test: Task 1 `events without a poster are not hero slides`.
3. **Long titles and organizer names at 375 px** (for example a 90-character title). The card title clamps to 2 lines, the organizer to 1 line, and nothing overflows horizontally. Covered by the Task 8 browser step, with a temporary long-title event.
4. **A keyboard-only user on the homepage.** Tab reaches the hero pause button, the arrows and every card. Focus inside the hero pauses autoplay, arrows work with Enter and Space, and focus is visible. Test: Task 3 `autoplay stops on focus, hover, touch, pause and reduced motion`, plus the Task 8 keyboard pass.
5. **The Unsplash image fails to load** (blocked or offline). The generic banner text stays readable on its dark fallback background. Covered by the Task 8 browser step, with the request blocked in Playwright.

## File Structure

```
src/lib/public/catalog-queries.ts    getHomeEvents → { featured, bestSellers, upcoming }; card gains organizerLogoPath
src/lib/public/hero-slides.ts        GENERIC_BANNERS, buildHeroSlides (pure)
src/lib/public/nav.ts                PUBLIC_NAV, FOOTER_COLUMNS model (pure)
src/lib/carousel.ts                  shouldAutoplay (pure)
src/components/carousel.tsx          client: scroll-snap track, arrows when overflowing, dots, optional autoplay + pause
src/components/poster-banner.tsx     poster centred over its own blurred copy (option B); generic banner variant
src/components/event-card.tsx        redesigned card
src/components/category-row.tsx      icon/initial tiles + pill labels
src/components/icons.tsx             SearchIcon, CalendarIcon, ChevronIcon, PauseIcon, PlayIcon, MenuIcon
src/components/theme-toggle.tsx      icon only
src/app/(public)/site-header.tsx     header (server) + nav-links.tsx (client, active state) + mobile menu
src/app/(public)/site-footer.tsx     four-column footer
src/app/(public)/layout.tsx          uses header/footer
src/app/(public)/page.tsx            new section order
next.config.ts                       img-src images.unsplash.com
tests/unit/hero-slides.test.ts, tests/unit/nav.test.ts, tests/unit/carousel.test.ts, tests/db/catalog-queries.test.ts
```

---

### Task 1: Hero slide assembly and generic banners

**Files:**
- Create: `src/lib/public/hero-slides.ts`
- Modify: `next.config.ts`
- Test: `tests/unit/hero-slides.test.ts`

**Interfaces:**
- Produces:
  - `type HeroSlide = { kind: "event"; key: string; href: string; title: string; posterPath: string } | { kind: "generic"; key: string; href: "/events"; title: string; subtitle: string; imageUrl: string; alt: string }`.
  - `GENERIC_BANNERS: ReadonlyArray<Omit<Extract<HeroSlide, { kind: "generic" }>, "kind">>`: exactly 3 entries. Each uses an `images.unsplash.com` photo of a concert, an exhibition and a theatre stage (no clearly identifiable faces). The copy is honest Indonesian with no event names, prices or dates; for example title "Jelajahi event di Anytix", subtitle "Beli tiket tanpa daftar akun".
  - `buildHeroSlides(featured: Array<{ slug: string; title: string; posterPath: string | null }>, min = 3, max = 6): HeroSlide[]`. Event slides come first (only those with a poster, up to `max`), then generic banners until `min` is reached.

- [ ] **Step 1: Write the failing tests.**
  - `hero falls back to generic banners`: `buildHeroSlides([])` → 3 slides, all `kind: "generic"`, every `href === "/events"`.
  - `featured events lead and banners fill to three`: 2 events → `[event, event, generic]`; event `href` is `/events/<slug>`.
  - `events without a poster are not hero slides`: 3 events with one `posterPath: null` → 2 event slides + 1 generic.
  - `hero is capped at six slides`: 8 events with posters → 6 event slides, no generic.
  - `generic banners use fixed unsplash urls`: each `imageUrl` starts with `https://images.unsplash.com/photo-` and does not contain `source.unsplash.com`.
- [ ] **Step 2: Run** `npm test -- hero-slides`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `hero-slides.ts`. Add `https://images.unsplash.com` to `img-src` in `next.config.ts`.
- [ ] **Step 4: Run** `npm test -- hero-slides`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(home): hero slide assembly with honest generic banners`.

### Task 2: Homepage queries

**Files:**
- Modify: `src/lib/public/catalog-queries.ts`
- Test: `tests/db/catalog-queries.test.ts`

**Interfaces:**
- Produces:
  - `PublicEventCard` gains `organizerLogoPath: string | null` (added to `cardColumns()`, so `/events` gets it too).
  - `getHomeEvents(): Promise<{ featured: PublicEventCard[]; bestSellers: PublicEventCard[]; upcoming: PublicEventCard[] }>`, all limited to `status = 'published' and ends_at > now()`:
    - `featured`: `is_featured`, ordered by `starts_at, id`, limit 6.
    - `bestSellers`: total `sold` across the event's inventory > 0, ordered by total sold desc then `starts_at`, limit 6.
    - `upcoming`: ordered by `starts_at, id`, limit 8.

- [ ] **Step 1: Write the failing tests** in `tests/db/catalog-queries.test.ts`:
  - `best sellers empty without sales`: a published event with sold 0 is absent from `bestSellers`.
  - `best sellers order by tickets sold`: events with sold 5 and 2 → `[sold 5, sold 2]`.
  - `ended events are not best sellers`: an event with sold 9 and `ends_at` in the past is absent.
  - `cards carry the organizer logo`: `organizerLogoPath` equals the stored path.

  Set `sold` directly on `ticket_inventory` in test setup, and clean up with `cleanupTestEvents`.
- [ ] **Step 2: Run** `npm run test:db -- catalog-queries`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test:db -- catalog-queries`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(home): best sellers query and organizer logo on cards`.

### Task 3: Carousel component

**Files:**
- Create: `src/lib/carousel.ts`, `src/components/carousel.tsx`, `src/components/icons.tsx`
- Test: `tests/unit/carousel.test.ts`

**Interfaces:**
- Produces:
  - `shouldAutoplay(s: { enabled: boolean; reducedMotion: boolean; paused: boolean; hovered: boolean; focused: boolean; touched: boolean; slideCount: number }): boolean`. It is true only when `enabled`, not reduced motion, none of the pause flags are set, and `slideCount > 1`.
  - `<Carousel label: string; items: ReactNode[]; itemClassName: string; dots?: boolean; autoplayMs?: number; peek?: boolean; arrowsLabel?: { prev: string; next: string } />`:
    - It is a client component; the track is a horizontal `overflow-x-auto` with `scroll-snap-type: x mandatory` and the scrollbar hidden.
    - Arrows render only while content overflows in that direction, using a `ResizeObserver` plus the scroll position.
    - Dots render only when `dots` is set and there are more than 1 item; clicking a dot scrolls to that item.
    - When `autoplayMs` is set, it advances every `autoplayMs` (wrapping to the first) under `shouldAutoplay`, and renders a pause/play button labelled "Jeda slide" / "Putar slide".
    - The region has `role="region"`, `aria-roledescription="carousel"` and `aria-label={label}`.
    - The scroll behavior is `smooth`, except under reduced motion.
  - `icons.tsx`: `SearchIcon`, `CalendarIcon`, `ChevronLeftIcon`, `ChevronRightIcon`, `PauseIcon`, `PlayIcon`, `MenuIcon`. Each takes `{ className?: string }` and is `aria-hidden`, drawn with a 24 px viewBox and a 2 px stroke.

- [ ] **Step 1: Write the failing test** `autoplay stops on focus, hover, touch, pause and reduced motion`. Cover:
  - each flag alone → false;
  - all clear with 3 slides → true;
  - 1 slide → false;
  - `enabled: false` → false.
- [ ] **Step 2: Run** `npm test -- carousel`. Expected: FAIL.
- [ ] **Step 3: Implement** `shouldAutoplay`, `Carousel` and the icons.
- [ ] **Step 4: Run** `npm test -- carousel`. Expected: PASS. Then run `npx tsc --noEmit` and `npx eslint src`. Expected: clean.
- [ ] **Step 5: Commit:** `feat(ui): scroll-snap carousel with accessible autoplay`.

### Task 4: Poster banner, event card and category row

**Files:**
- Create: `src/components/poster-banner.tsx`, `src/components/category-row.tsx`
- Modify: `src/components/event-card.tsx`

**Interfaces:**
- Consumes: `HeroSlide` (Task 1), `PublicEventCard` with `organizerLogoPath` (Task 2), the icons (Task 3).
- Produces:
  - `<PosterBanner slide: HeroSlide; preload?: boolean; caption?: boolean />`. The whole banner is one link.
    - **Event slide:** the frame is `aspect-[16/9] sm:aspect-[3/1]`. Below `sm` the poster fills the frame. From `sm` up, the poster sits centred at 16:9 full height over the same image scaled 1.2, with `blur(24px)` and `brightness(.7)`. With `caption`, the event title shows on a bottom label (Laris Manis).
    - **Generic slide:** the photo covers the frame (`object-cover`), with a dark gradient scrim under left-aligned title and subtitle. A `stone-900` background sits underneath, so the text stays readable if the image fails.
    - Link `aria-label`: the event title, or the generic title.
  - `<EventCard event: PublicEventCard; preload?: boolean />`, in this order:
    - the 16:9 poster, or a neutral `surface-muted` tile;
    - the title (`line-clamp-2`);
    - `CalendarIcon` with the date and ` · city`;
    - "Mulai dari" with the accent price (or "Harga belum tersedia");
    - a divider;
    - the organizer logo (28 px circle), or the initial on `surface-muted`, then the name (`truncate`).

    No category label. One `after:inset-0` link covers the whole card.
  - `<CategoryRow categories: PublicCategory[] />`:
    - Each category shows a round 64 px tile with the uploaded icon (`next/image`) or its initial, plus a pill label below.
    - On mobile it is a horizontal scroll row; on desktop it spreads to full width.
    - Each item links to `/events?category=<slug>`.

- [ ] **Step 1: Implement** the three components.
- [ ] **Step 2: Run** `npx tsc --noEmit` and `npx eslint src`. Expected: clean. Visual checks happen in Task 8.
- [ ] **Step 3: Commit:** `feat(ui): poster banner, redesigned event card and category row`.

### Task 5: Nav model and header

**Files:**
- Create: `src/lib/public/nav.ts`, `src/app/(public)/site-header.tsx`, `src/app/(public)/nav-links.tsx`
- Modify: `src/components/theme-toggle.tsx`, `src/app/(public)/layout.tsx`
- Test: `tests/unit/nav.test.ts`

**Interfaces:**
- Produces:
  - `type NavItem = { label: string; href: string; match?: "exact" | "prefix" } | { label: string; soon: true }`.
  - `publicNav(site: { csWhatsapp: string; csEmail: string }): NavItem[]` returns, in this order:
    - Beranda (`/`, exact);
    - Jelajah Event (`/events`, prefix);
    - Tentang (soon);
    - Hubungi Kami (`/#kontak`), only when a CS contact exists.
  - `isActive(item, pathname): boolean`.
  - **Header** (server; reads `getPublicSite()` for logo, name and contacts):
    - Logo on the left.
    - From `lg` up, the pill nav (`nav-links.tsx`, client, `usePathname`). The active pill uses `bg-accent text-on-accent`; soon items show as plain text with a small "Segera" tag and are not focusable.
    - On the right: a search icon link to `/events?fokus=cari` (the `/events` page focuses its search input when `fokus=cari` is present), the theme toggle, and below `lg` a menu button that opens the same items in a panel. The panel closes with Escape and on navigation.
  - **ThemeToggle:** icon only. It keeps `aria-label` and `title`, renders as a 44 px square, and the visible text label is removed.

- [ ] **Step 1: Write the failing tests:**
  - `nav hides contact without CS details`;
  - `soon items have no href`;
  - `jelajah is active on event pages` (`isActive` on `/events/abc` → true; Beranda on `/events` → false).
- [ ] **Step 2: Run** `npm test -- nav`. Expected: FAIL.
- [ ] **Step 3: Implement** the header and the theme toggle change, and wire them into `layout.tsx`. The `/events` search input gets `autoFocus` when the `fokus` param is `cari`.
- [ ] **Step 4: Run** `npm test -- nav`, `npx tsc --noEmit` and `npx eslint src`. Expected: PASS and clean.
- [ ] **Step 5: Commit:** `feat(public): pill nav header with icon-only theme toggle`.

### Task 6: Footer

**Files:**
- Create: `src/app/(public)/site-footer.tsx`
- Modify: `src/app/(public)/layout.tsx`, `src/lib/public/nav.ts`
- Test: `tests/unit/nav.test.ts`

**Interfaces:**
- Produces:
  - `footerColumns(site, categories: PublicCategory[]): Array<{ title: string; items: NavItem[] }>`, returning three columns after the brand column:
    - **Tentang Kami:** Tentang (soon), Biaya (soon), and Hubungi Kami `/#kontak` when a contact exists.
    - **Informasi:** Syarat & Ketentuan `/terms`, Kebijakan Privasi & Pemrosesan Data `/privacy`, FAQ (soon).
    - **Kategori Event:** up to 5 categories with `eventCount > 0` (`/events?category=slug`), then Semua Kategori `/events`.
  - `<SiteFooter>`:
    - Background `bg-stone-950` with `stone` text in both themes. The text contrast must be checked.
    - Brand column with `id="kontak"`: logo or name, the tagline "Beli tiket event tanpa perlu daftar akun.", WhatsApp `https://wa.me/<n>` and `mailto:` email when set.
    - A divider, then "© {year} {site.name}. Hak Cipta Dilindungi.".
    - The year comes from a cached server helper, because `new Date()` in a prerendered component needs `"use cache"` under cacheComponents. Read the cacheComponents date guidance in `node_modules/next/dist/docs/` first.
    - Grid: 1 column on mobile, 2 at `sm`, `1.4fr 1fr 1fr 1fr` at `lg`.

- [ ] **Step 1: Write the failing tests:**
  - `footer lists five categories with events then all`;
  - `footer informasi links exist` (hrefs `/terms` and `/privacy`, FAQ soon).
- [ ] **Step 2: Run** `npm test -- nav`. Expected: FAIL.
- [ ] **Step 3: Implement** and wire into `layout.tsx`, removing the old footer markup.
- [ ] **Step 4: Run** `npm test -- nav`, `npx tsc --noEmit` and `npx eslint src`. Expected: PASS and clean.
- [ ] **Step 5: Commit:** `feat(public): four-column footer with copyright`.

### Task 7: Homepage assembly

**Files:**
- Modify: `src/app/(public)/page.tsx`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces the homepage, in this order:
  1. An `sr-only` `h1` with "{site.name}: tiket event tanpa daftar akun".
  2. **Hero:** `Carousel` with `peek`, dots, `autoplayMs: 6000`, label "Event pilihan", built from `buildHeroSlides(featured)` through `PosterBanner`. The first slide gets `preload`.
  3. **Rekomendasi Event:** cards from `featured`, or `upcoming` when `featured` is empty. It is hidden when both are empty.
  4. **Laris Manis:** the centred title with the subtitle "Event yang paling banyak dipesan saat ini.", then a `Carousel` of `PosterBanner caption` built from `bestSellers`. It is hidden when `bestSellers` is empty.
  5. **Kategori Event:** `CategoryRow`, hidden when there are no categories.
  6. **Event Terdekat:** a grid of `upcoming` (1/2/4 columns), with "Lihat Lainnya" to `/events` when there are more than 0 events. Keep the existing empty state.

  The old hero h1 and the search form are removed, since search is now in the header. Section spacing follows the RHYTHM 2 dial and varies between sections.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm test`, `npx tsc --noEmit`, `npx eslint .` and `npm run build`. Expected: all pass.
- [ ] **Step 3: Commit:** `feat(home): artatix-style homepage with real data only`.

### Task 8: Verification, antislop audit and handoff

- [ ] **Step 1: Browser check** on `npm run start`, with Playwright at 375, 768, 1024 and 1440 px, in light and dark:
  - **Header:**
    - Pill active state is correct on `/` and `/events`.
    - Tentang shows "Segera" and cannot be clicked or focused.
    - Hubungi Kami scrolls to the footer contact.
    - The search icon opens `/events` with the input focused.
    - The theme icon cycles through all three modes, with no visible text label.
    - The mobile menu opens, closes with Escape, and closes on navigation.
  - **Hero:**
    - With the one-event dev DB, it shows the Jazz poster plus 2 generic banners.
    - Arrows, dots and swipe work.
    - Autoplay advances and pauses on hover, focus and the pause button.
    - Under `page.emulateMedia({ reducedMotion: 'reduce' })` nothing autoplays.
    - With `images.unsplash.com` blocked, the generic banner text stays readable.
  - **Sections:**
    - Rekomendasi has no arrows with one card.
    - Laris Manis is hidden with no sales, and visible after setting `sold` on a temporary test event.
    - Category row, grid and Lihat Lainnya behave as specified.
    - A temporary event with a 90-character title shows no overflow at 375 px.
  - **Footer:** 4 columns at `lg`, stacked on mobile; links work; copyright year shown; no social row.
  - **Contrast and errors:** contrast tool on footer text, the Segera tag and card text in both themes; no console errors except the known Midtrans/Next preload notices.
  - **Cleanup:** remove the temporary events afterwards.
- [ ] **Step 2: Antislop audit** (AFTER mode): write `anti-slop/audit-004-2026-10-18.md` with the Delivery Gate and numbered findings; report them to the owner and fix only the approved numbers.
- [ ] **Step 3: Run** `npm test`, `npm run test:db`, `npm run lint` and `npm run build`. Expected: all pass.
- [ ] **Step 4: Update** `docs/superpowers/HANDOFF.md` (homepage revamp done, "Segera" pages listed as open work), commit, push to `main`, and report to the owner in Indonesian with the deploy command `bash deploy/deploy.sh`.
