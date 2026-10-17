# Fase 1 — Katalog & Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin can build and publish a complete event (category, event details with poster, ticket categories with quota, form fields, transaction/site/SMTP settings) and see it on the public pages `/`, `/events`, `/events/{slug}` and `/events/{slug}/tickets`, in light and dark mode.

**Architecture:** Admin screens are client components that call JSON Route Handlers under `/api/admin/*`. Each handler validates with a zod schema shared with its form, writes through a small service module in `src/lib/`, records an audit log row, and invalidates the public cache tags it affects. Public pages read through cached data functions (`'use cache'` + `cacheTag`) so they prerender and stay CDN-friendly; only the availability endpoint is near-real-time.

**Tech Stack:** Next.js 16.4 (cacheComponents), Tailwind CSS 4, postgres.js, zod 4, Tiptap 3.32 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`), `sanitize-html` 2.18, `@dnd-kit/core` 6.3 + `@dnd-kit/sortable` 10 + `@dnd-kit/utilities` 3.2, `nodemailer` 10.1, `next/font/google` (Plus Jakarta Sans).

**Spec:** `PRD.md` + `docs/superpowers/specs/2026-10-17-anytix-mvp-design.md` (design doc wins on conflict). Builds on Fase 0 (`docs/superpowers/plans/2026-10-17-fase-0-fondasi.md`).

## Global Constraints

- Everything from the Fase 0 plan's Global Constraints still applies (AGENTS.md comment rules, no AI attribution in commits, naming, plpgsql rules, lock order, `max_pipeline: 0`, use `transaction()` never `sql.begin`).
- UI text is Indonesian; antislop applies during the work (owner's choice). Load `antislop:antislop`, `antislop:antislop-ui`, `antislop:antislop-copywriting` before the first UI task, and `antislop:antislop-human` + `antislop:antislop-layoutmobile` before the public pages task.
- Visual direction (owner, design doc §1): one accent `#C2410C` used sparingly (primary buttons, prices, key status); everything else neutral; font Plus Jakarta Sans; text logo "Anytix". Dials: ENERGY 2 / RHYTHM 2 / MOTION 1 (builder's call from "mirip Artatix, netral + satu aksen").
- Contrast: white text on `#C2410C` is 5.2:1 (AA). Accent-coloured text on the dark background must use a lighter token (`#FB923C`, about 7:1 on `#0A0A0A`); check every new pairing with the antislop contrast tool.
- Dark mode: follows the OS by default, manual toggle stored in `localStorage` key `theme` (`light` | `dark` | absent), no flash on load, both modes fully working (R-34). QR images and posters keep a white or neutral backing.
- Every admin mutation: `requireAdmin`, zod validation (errors returned as `{ error, fields: { [name]: message } }` with status 422), `writeAudit(...)`, then public cache invalidation for the tags it touches. Responses `cache-control: no-store`.
- Rich text (event description, terms, ticket category description) is stored as HTML sanitized server-side with one allow-list (`sanitizeRichText`), never trusted from the client.
- Money is integer rupiah; dates are `timestamptz`, displayed in the event's timezone (`Asia/Jakarta` WIB, `Asia/Makassar` WITA, `Asia/Jayapura` WIT) with `Intl.DateTimeFormat('id-ID', …)`.
- Facilities checklist keys (PRD §16), fixed in code: `parking`, `toilet`, `medical`, `prayer_room`, `food_court`, `photo_booth`, `smoking_area`, `water_station`, `storage`, `information_center`, `merchandise`, `charging_station`, `disability_access`, `kids_area`.
- `events.sale_status` is the source of truth; every write that changes it updates the event's default `event_sessions.status` in the same transaction (deferred minor from Fase 0 review).
- Ticket card status badges (PRD §7): `On Sale`, `Hampir habis` (remaining ≤ 10% of capacity or ≤ 10 units), `Sold Out`, `Segera dibuka`, `Penjualan ditutup`.
- Public pages never set cookies (Fase 0 ruling); `/checkout/*` and `/orders/*` are not part of this phase.
- Out of scope here: email templates (Fase 2, with the email jobs), voucher admin (Fase 3), admin accounts and audit log viewer (Fase 3), sales dashboard (Fase 3). Audit rows are already written from Task 2 on.
- `next build` prerenders public pages from the database, so it needs `.env.local` (or real env) with `DATABASE_URL`; this supersedes the Fase 0 deferred minor about building without env.
- Next.js 16 rules (from the bundled docs, summarized 17 Okt 2026):
  - Admin writes happen in Route Handlers, so cache invalidation is `revalidateTag(tag, { expire: 0 })` (`updateTag` throws outside Server Actions); admin screens call `router.refresh()` after a successful write.
  - Cached reads put `'use cache'` as the first statement of an async function, with `cacheLife(...)` and `cacheTag(...)` inside; never call `cookies()`/`headers()` inside them.
  - Dynamic segments that must really 404 or redirect resolve the param before any `<Suspense>` and export `generateStaticParams` returning at least one entry; never export `dynamicParams`.
  - `next/image` ignores a custom `srcSet`, so media variants go through a global `images.loaderFile`.
  - Route Handlers have no CSRF origin check: `adminRoute` rejects non-GET requests whose `Origin` header is present and differs from `APP_URL` (403).
  - Tag invalidation is per server instance (single-instance MVP, design doc §5).
  - Vitest runs outside Next: `tests/setup.ts` mocks `next/cache` (`cacheLife`/`cacheTag` are no-ops, `revalidateTag` records into `globalThis.__revalidatedTags`), so services can assert which tags they invalidate.

## Review Focus

1. Admin renames a slug A → B → C, then back to A: `/events/A` serves the event directly, `/events/B` permanently redirects to `/events/A`, and no redirect loop or orphan row is left (Task 4 test `slug history round trip`).
2. Admin lowers a ticket category's capacity below `sold + held`: the form shows "Kuota minimal {sold + held} (terjual + sedang dipesan)", never a 500 (Task 6 test `capacity below sold plus held is rejected with a message`).
3. Admin tries to delete a ticket category that has ever been reserved, or a form field that already has answers: the request is refused with a message offering hide/deactivate (Task 6 and Task 7 tests `refuses delete when used`).
4. Rich text pasted from elsewhere contains `<script>`, `onerror=`, `javascript:` links or inline styles: everything outside the allow-list is stripped before saving (Task 2 test `sanitizeRichText strips active content`).
5. A draft or archived event, or a hidden ticket category, never shows on public pages even by direct URL, and "Harga mulai dari" uses only active, visible categories (Task 9 tests `draft event is not public`, `min price ignores hidden categories`).

## File Structure

```
db/migrations/0006_catalog.sql                  events.is_featured; function privilege scan helper view
src/lib/slug.ts                                 slugify(title)
src/lib/rich-text.ts                            sanitizeRichText(html)
src/lib/audit.ts                                writeAudit(tx|sql, input)
src/lib/admin-route.ts                          adminRoute(schema?, handler) wrapper: auth, JSON, zod → 422, no-store
src/lib/public-cache.ts                         cache tag names + invalidatePublic(...tags)
src/lib/format.ts                               formatRupiah, formatEventSchedule, timezone labels
src/lib/ticket-status.ts                        ticketBadge(input, now)
src/lib/form-schema.ts                          FormField type, buildAnswersSchema(fields), fieldKeyFromLabel(label)
src/lib/validation/catalog.ts                   zod schemas: eventCategoryInput, eventInput, ticketCategoryInput, formFieldInput
src/lib/validation/settings.ts                  zod schemas: transactionSettings, siteSettings, smtpSettingsInput
src/lib/catalog/event-category-service.ts       list/create/update/reorder/remove
src/lib/catalog/event-service.ts                list/get/create/update (slug history, session sync)
src/lib/catalog/ticket-category-service.ts      list/create/update/reorder/remove (inventory)
src/lib/catalog/form-field-service.ts           list/create/update/reorder/remove
src/lib/settings-service.ts                     getSettingsGroup/putSettingsGroup (smtp secret encrypted)
src/lib/email/email-provider.ts                 EmailProvider, SmtpProvider, getEmailProvider()
src/lib/public/catalog-queries.ts               cached public reads (tagged)
src/components/ui/*.tsx                         Button, Field, TextArea, Select, Checkbox, Alert, Spinner, Dialog, Badge, Skeleton
src/components/theme-toggle.tsx                 client toggle
src/components/rich-text-editor.tsx             Tiptap editor (client)
src/components/image-upload.tsx                 upload to /api/admin/uploads (client)
src/components/sortable-list.tsx                dnd-kit sortable list (client)
src/app/layout.tsx                              fonts, theme bootstrap script, tokens
src/app/(public)/layout.tsx, page.tsx, events/page.tsx, events/[slug]/page.tsx, events/[slug]/tickets/page.tsx
src/app/admin/(panel)/layout.tsx                admin shell nav (existing dashboard/security move inside)
src/app/admin/(panel)/event-categories/…, events/…, settings/…
src/app/api/admin/event-categories/…, events/…, events/[id]/ticket-categories/…, events/[id]/form-fields/…, settings/[group]/…
src/app/api/events/[slug]/availability/route.ts
src/app/sitemap.ts, src/app/robots.ts
tests/unit/*.test.ts, tests/db/*.test.ts
```

---

### Task 1: Design system, theme, shells

**Files:**
- Create: `src/lib/theme.ts`, `src/components/theme-toggle.tsx`, `src/components/ui/button.tsx`, `src/components/ui/field.tsx` (Field, TextArea, Select, Checkbox), `src/components/ui/alert.tsx`, `src/components/ui/spinner.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/skeleton.tsx`, `src/components/image-upload.tsx`, `src/components/sortable-list.tsx`, `src/app/admin/(panel)/layout.tsx`, `src/app/admin/(panel)/admin-nav.tsx`
- Modify: `src/app/layout.tsx`, `src/app/globals.css`; move `src/app/admin/page.tsx`, `src/app/admin/security/*`, `admin-bar.tsx`, `logout-button.tsx` into `src/app/admin/(panel)/`; replace `src/app/admin/ui.tsx` imports with `@/components/ui/*` and delete it
- Test: `tests/unit/theme.test.ts`

**Interfaces:**
- Produces:
  - `globals.css` tokens (light defaults, dark under `[data-theme=dark]`): `--color-bg`, `--color-surface`, `--color-border`, `--color-text`, `--color-muted` (≥ 4.5:1 on bg and surface), `--color-accent` `#C2410C`, `--color-accent-hover` `#9A3412`, `--color-accent-text` (light `#C2410C`, dark `#FB923C`), `--color-on-accent` `#FFFFFF`, `--color-danger`, `--color-success`, `--color-warning`; exposed to Tailwind with `@theme inline` (`bg-bg`, `text-muted`, `bg-accent`, …) and `--font-sans: var(--font-jakarta)`; dark variant `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));`.
  - `layout.tsx`: `Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", variable: "--font-jakarta" })`; `<html lang="id" suppressHydrationWarning>`; inline `<script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />` in `<head>`; site-wide `metadata` (title template `%s · Anytix`).
  - `theme.ts`: `resolveTheme(stored: string | null, systemDark: boolean): "light" | "dark"` and `THEME_SCRIPT` (reads `localStorage.theme` in `try/catch`, sets `document.documentElement.dataset.theme`, follows `prefers-color-scheme` changes when nothing is stored).
  - `ThemeToggle` (client): cycles Terang / Gelap / Ikuti sistem, writes `localStorage`, re-applies `data-theme` in `useLayoutEffect` (dev Strict Mode clears it), `aria-label` names the current mode.
  - UI components keep the Fase 0 `Button`/`Field`/`Alert`/`Spinner` APIs and switch to tokens; new: `TextArea`, `Select` (native `<select>`), `Checkbox`, `Dialog` (native `<dialog>`, `open`/`onClose`, Escape closes, focus returns to the opener), `Badge` (`tone: "accent" | "warning" | "muted" | "success"`), `Skeleton`.
  - `src/lib/media.ts` (client-safe): `mediaUrl(base: string, size: "lg" | "md" | "thumb"): string` built from `NEXT_PUBLIC_MEDIA_BASE_URL` (`<SUPABASE_URL>/storage/v1/object/public/media`, added to `.env.example`, `.env.local` and `env.ts`); `src/lib/storage.ts` re-exports it instead of building URLs from the server-only `SUPABASE_URL`.
  - `ImageUpload` (client): props `{ kind: "poster" | "logo" | "icon"; value: string | null; onChange(base: string | null): void; label: string }`; posts to `/api/admin/uploads`, shows a preview from `mediaUrl(base, "md")`, progress spinner, error message, remove button.
  - `SortableList<T>` (client): props `{ items: T[]; getId(item): number; onReorder(ids: number[]): void; renderItem(item, handleProps): ReactNode }` with `@dnd-kit/core` pointer and keyboard sensors and a drag handle button labelled "Geser untuk mengurutkan".
  - Admin shell: header with nav (Dasbor, Keamanan for now; each later task adds its own link only when its page exists), admin email, Keluar; content max width; nav collapses into a menu button below 768 px.

- [ ] **Step 1: Load** `antislop:antislop`, `antislop:antislop-ui`, `antislop:antislop-copywriting`; Design Read: "Reading this as: event ticketing site and its admin panel for Indonesian event-goers and one operator, neutral language with one brick-red accent, dial ENERGY 2 / RHYTHM 2 / MOTION 1."
- [ ] **Step 2: Write the failing test** `theme.test.ts`: `resolveTheme("dark", false)` is `"dark"`; `resolveTheme("light", true)` is `"light"`; `resolveTheme(null, true)` is `"dark"`; `resolveTheme("weird", false)` is `"light"`.
- [ ] **Step 3: Run** `npm test`. Expected: FAIL. **Implement** `theme.ts`, tokens, layout, components (`npm i @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`), admin shell move. **Run** again. Expected: PASS; `npm run build` passes.
- [ ] **Step 4: Verify in the browser:** no theme flash on reload in dark mode (screenshot right after navigation), toggle cycles and persists, admin login/dashboard/security still work after the move, contrast of every token pair checked with the antislop contrast tool in both themes, 375 px nav menu opens and closes.
- [ ] **Step 5: Commit:** `feat(ui): design tokens, dark mode, shared components, admin shell`.

### Task 2: Admin API foundation

**Files:**
- Create: `db/migrations/0006_catalog.sql`, `src/lib/slug.ts`, `src/lib/rich-text.ts`, `src/lib/audit.ts`, `src/lib/admin-route.ts`, `src/lib/public-cache.ts`
- Test: `tests/unit/slug.test.ts`, `tests/unit/rich-text.test.ts`, `tests/db/admin-route.test.ts`, `tests/db/privileges.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (Fase 0), `sql`, `transaction`, `Tx`.
- Produces:
  - `0006_catalog.sql`: `alter table events add column is_featured boolean not null default false`; index `events (status, starts_at)`.
  - `slugify(title: string): string`: NFKD, strip diacritics and anything outside `[a-z0-9]`, collapse to single `-`, trim `-`, max 80 chars, empty input gives `"event"`.
  - `sanitizeRichText(html: string): string`: `sanitize-html` with tags `p br strong em u s a ul ol li h2 h3 blockquote`, attribute `href` on `a` only (schemes `http`, `https`, `mailto`), every `a` gets `rel="noopener noreferrer nofollow"` and `target="_blank"`, no `style`/`class`.
  - `writeAudit(db: Sql | Tx, input: { adminId: number; action: string; entity: string; entityId: string | number; diff?: unknown }): Promise<void>`.
  - `type AdminContext = { admin: Admin; req: NextRequest; params: Record<string, string> }`.
  - `adminRoute<T>(schema: ZodType<T> | null, handler: (ctx: AdminContext & { body: T }) => Promise<Response>): (req: NextRequest, route: { params: Promise<Record<string, string>> }) => Promise<Response>`:
    - 401 without admin.
    - JSON body parsed and validated when `schema` is given; failures give 422 `{ error: "Periksa kembali isian yang ditandai.", fields: { "<path>": "<message>" } }`.
    - Adds `cache-control: no-store` to every response.
    - A thrown `UserError(message, status = 400, fields?)` becomes `{ error, fields }` with that status.
  - `class UserError extends Error { status: number; fields?: Record<string, string> }`.
  - `public-cache.ts`: tag constants `TAG_CATEGORIES = "categories"`, `TAG_EVENTS = "events"`, `TAG_SITE = "site-settings"`, `eventTag(id: number): string` returning `event-<id>`, and `invalidatePublic(...tags: string[]): void` (Next tag invalidation; exact API per the Next 16 docs summary recorded in the ledger).

- [ ] **Step 1: Write the failing unit tests**
  - `slug.test.ts`: `slugify("Konser Musik Jazz 2026!")` is `"konser-musik-jazz-2026"`; `slugify("Pameran Seni & Budaya, Édisi Ke-2")` is `"pameran-seni-budaya-edisi-ke-2"`; `slugify("🎉🎉")` is `"event"`; result length ≤ 80 for a 200-char title.
  - `rich-text.test.ts` (`sanitizeRichText strips active content`): input `<p onclick="x()">Hai<script>alert(1)</script></p><a href="javascript:alert(1)">x</a><img src=x onerror=alert(1)><a href="https://a.id">ok</a>` gives output containing `<p>Hai</p>`, no `script`, no `onclick`, no `onerror`, no `<img`, no `javascript:`, and the https link keeps `href` with `rel="noopener noreferrer nofollow"`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** `slug.ts`, `rich-text.ts` (`npm i sanitize-html`, `npm i -D @types/sanitize-html`), `audit.ts`, `public-cache.ts`, `admin-route.ts`, and the migration; run `npm run db:migrate`.
- [ ] **Step 4: Write the failing DB tests**
  - `admin-route.test.ts`, using a throwaway route built with `adminRoute(z.object({ name: z.string().min(2) }), …)`:
    - `401 without session`.
    - `422 with field messages`: body `{ name: "a" }` returns `fields.name`.
    - `no-store on success`: 200 with `cache-control: no-store`.
    - `UserError maps to its status`: a handler throwing `new UserError("Tidak bisa", 409)` returns 409 `{ error: "Tidak bisa" }`.
  - `privileges.test.ts` (`no public function is executable by anon`): every function in schema `public` (`pg_proc` join `pg_namespace`) has `has_function_privilege('anon', oid, 'execute') = false`, and the same for `authenticated`. This covers the Fase 0 deferred minor; if it finds a function, add the missing `revoke` to `0006`.
- [ ] **Step 5: Run** `npm test` and `npm run test:db -- admin-route privileges`. Expected: PASS.
- [ ] **Step 6: Commit:** `feat(admin): API foundation (route wrapper, audit, slug, rich text, cache tags)`.

### Task 3: Event categories

**Files:**
- Create: `src/lib/validation/catalog.ts` (category part), `src/lib/catalog/event-category-service.ts`, `src/app/api/admin/event-categories/route.ts`, `src/app/api/admin/event-categories/[id]/route.ts`, `src/app/api/admin/event-categories/reorder/route.ts`, `src/app/admin/(panel)/event-categories/page.tsx`, `src/app/admin/(panel)/event-categories/category-manager.tsx`
- Modify: admin nav (add "Kategori Event")
- Test: `tests/db/event-categories.test.ts`

**Interfaces:**
- Consumes: Task 2 (`adminRoute`, `UserError`, `writeAudit`, `slugify`, `invalidatePublic`, `TAG_CATEGORIES`, `TAG_EVENTS`); `ImageUpload`, `SortableList`, `Dialog` (Task 1).
- Produces:
  - `eventCategoryInput = z.object({ name: z.string().trim().min(2).max(60), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60).optional(), icon: z.string().max(200).nullable().optional(), isActive: z.boolean().default(true) })`. Slug defaults to `slugify(name)`; icon is a media base path from the upload pipeline (kind `icon`).
  - `type EventCategory = { id: number; name: string; slug: string; icon: string | null; position: number; isActive: boolean; eventCount: number }`.
  - Service:
    - `listEventCategories(): Promise<EventCategory[]>`, ordered by position.
    - `createEventCategory(adminId, input)`: appended at the last position.
    - `updateEventCategory(adminId, id, input)`.
    - `reorderEventCategories(adminId, ids: number[])`: positions 1..n in the given order; `ids` must equal the full set, otherwise `UserError(…, 422)`.
    - `removeEventCategory(adminId, id)`: throws `UserError("Kategori masih dipakai {n} event. Sembunyikan saja.", 409)` when events reference it.
    - Duplicate slug gives `UserError("Slug sudah dipakai kategori lain.", 409, { slug: … })`.
    - Every write: audit + `invalidatePublic(TAG_CATEGORIES, TAG_EVENTS)`.
  - Routes: `GET/POST /api/admin/event-categories`, `PATCH/DELETE /api/admin/event-categories/{id}`, `PUT /api/admin/event-categories/reorder` with `{ ids: number[] }`.
  - Admin page: list of categories (icon, name, slug, event count, visibility toggle), "Tambah kategori" dialog, edit dialog, drag-and-drop reorder, delete with confirmation (shows the 409 message when used). Empty, loading and error states.

- [ ] **Step 1: Write the failing tests** `event-categories.test.ts` (slugs prefixed `test-cat-`, deleted in `afterAll`):
  - `creates with slug from name`: name `"Test Cat Seni Rupa"` gives slug `test-cat-seni-rupa`, last position, and an audit row with `action 'create'`, `entity 'event_category'`.
  - `rejects duplicate slug`: 409 with `fields.slug`.
  - `reorder sets positions in given order`; a partial id list gives 422.
  - `refuses delete when used`: a category referenced by a test event gives 409 with a message containing `Sembunyikan`; an unused one is deleted.
  - Route level: `POST` with `{ name: "a" }` gives 422 `fields.name`.
- [ ] **Step 2: Run** `npm run test:db -- event-categories`. Expected: FAIL.
- [ ] **Step 3: Implement** schema, service, routes.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Build the admin page**, then verify in the browser: add, rename, hide, reorder (persists after reload), keyboard reorder, delete used and unused, at 375 px and in dark mode.
- [ ] **Step 6: Commit:** `feat(admin): event categories`.

### Task 4: Events service and API

**Files:**
- Modify: `src/lib/validation/catalog.ts` (event part)
- Create: `src/lib/catalog/event-service.ts`, `src/app/api/admin/events/route.ts`, `src/app/api/admin/events/[id]/route.ts`
- Test: `tests/db/events.test.ts`

**Interfaces:**
- Consumes: Task 2, `transaction`.
- Produces:
  - `eventInput` (zod):
    - `title` 3..150; `slug` optional kebab-case ≤ 80 (default `slugify(title)`); `eventCategoryId` int.
    - `description`, `terms` (HTML) and `refundPolicy` (plain text), each ≤ 50 000 chars.
    - `facilities`: unique array of the 14 fixed keys.
    - `startsAt`, `endsAt` ISO strings with `endsAt >= startsAt`; `timezone` one of the three.
    - `venue`, `city`, `province` ≤ 120; `mapUrl` https URL or empty; `organizerName` ≤ 120; `organizerLogoPath`, `posterPath` media base path or null.
    - `socialLinks` with optional `instagram`, `tiktok`, `x`, `facebook`, `youtube`, `website` (https URLs).
    - `status` `draft|published|archived`; `saleStatus` `on_sale|paused|closed`; `isFeatured` boolean; `seo` `{ title?: ≤ 70 chars, description?: ≤ 160 chars }`.
  - `type AdminEvent`: all event columns in camelCase plus `ticketCategoryCount` and `sessionId`.
  - Service:
    - `listAdminEvents(filter: { q?: string; status?: string }): Promise<AdminEventRow[]>`.
    - `getAdminEvent(id): Promise<AdminEvent | null>`.
    - `createEvent(adminId, input): Promise<AdminEvent>`: one `transaction()` that inserts the event and its default `event_sessions` row (same times, status = `saleStatus`); rich text sanitized; slug used by another event gives `UserError(…, 409, { slug })`; a slug that only exists in `slug_redirects` is taken over (its redirect row deleted).
    - `updateEvent(adminId, id, input)`: one transaction. When the slug changes, insert the old slug into `slug_redirects` (on conflict update `event_id`) and delete any redirect row whose `old_slug` equals the new slug. Update the default session's `starts_at`, `ends_at` and `status`. Audit with a diff of changed fields.
    - `resolveSlug(slug): Promise<{ eventId: number; currentSlug: string; redirected: boolean } | null>` for the public 301.
    - Every write: `invalidatePublic(TAG_EVENTS, eventTag(id))`.
  - Routes: `GET/POST /api/admin/events`, `GET/PATCH /api/admin/events/{id}`. No delete: events are archived, because orders must keep their event.

- [ ] **Step 1: Write the failing tests** `events.test.ts` (slugs prefixed `test-`):
  - `create makes a default session with the sale status`.
  - `sale status change syncs the session`: updating `saleStatus` to `paused` makes the session `paused`, and `reserve_tickets` then raises `NOT_ON_SALE`.
  - `slug history round trip` (Review Focus 1): A → B → C → A. Afterwards `resolveSlug(A)` is not redirected, `resolveSlug(B)` and `resolveSlug(C)` redirect to A, and no `slug_redirects` row has `old_slug = A`.
  - `takes over a slug that is only a redirect`: event 1 renamed X → Y; creating event 2 with slug X succeeds and `resolveSlug(X)` gives event 2, not redirected.
  - `sanitizes rich text on save`.
  - `rejects endsAt before startsAt`: 422 with `fields.endsAt`.
- [ ] **Step 2: Run** `npm run test:db -- events`. Expected: FAIL.
- [ ] **Step 3: Implement** schema, service, routes.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(admin): events service and API`.

### Task 5: Admin event list and editor

**Files:**
- Create: `src/lib/facilities.ts`, `src/lib/format.ts` (date/time part), `src/app/admin/(panel)/events/page.tsx`, `src/app/admin/(panel)/events/events-table.tsx`, `src/app/admin/(panel)/events/new/page.tsx`, `src/app/admin/(panel)/events/[id]/page.tsx`, `src/app/admin/(panel)/events/[id]/event-form.tsx`, `src/app/admin/(panel)/events/[id]/event-tabs.tsx`, `src/components/rich-text-editor.tsx`
- Modify: admin nav (add "Event")
- Test: `tests/unit/format.test.ts`

**Interfaces:**
- Consumes: Task 4 routes and `eventInput`; `ImageUpload`, `Dialog`, `Field`, `Select`, `Checkbox` (Task 1).
- Produces:
  - `FACILITIES: ReadonlyArray<{ key: FacilityKey; label: string }>` with the 14 keys from Global Constraints and Indonesian labels (Area parkir, Toilet, Pos medis, Musholla, Food court, Photo booth, Area merokok, Water station, Penitipan barang, Pusat informasi, Merchandise, Charging station, Akses disabilitas, Area anak).
  - `TIMEZONES = { "Asia/Jakarta": { label: "WIB", offset: "+07:00" }, "Asia/Makassar": { label: "WITA", offset: "+08:00" }, "Asia/Jayapura": { label: "WIT", offset: "+09:00" } }` (Indonesia has no DST, so fixed offsets are exact).
  - `toIsoFromLocal(local: string, tz: Timezone): string` (`"2026-12-20T19:00"` + `Asia/Jakarta` gives `"2026-12-20T19:00:00+07:00"`), `toLocalInput(iso: string, tz: Timezone): string` (inverse, for `datetime-local` inputs).
  - `RichTextEditor` (client): props `{ id: string; label: string; value: string; onChange(html: string): void; error?: string }`; Tiptap StarterKit with toolbar buttons Bold, Italic, Heading 2/3, bullet list, numbered list, link, undo/redo; toolbar is keyboard reachable with `aria-pressed` states.
  - Admin pages:
    - `/admin/events`: list with search box and status filter (title, category, schedule, status, sale status, ticket category count) and a "Buat event" button; empty, loading, error states.
    - `/admin/events/new` and `/admin/events/{id}`: one form in sections (Informasi dasar, Jadwal, Lokasi, Penyelenggara, Poster, Deskripsi, Syarat & Ketentuan, Fasilitas, Kebijakan Refund, Media sosial, SEO, Status & penjualan); field errors from 422 shown next to fields; changing the slug of a published event shows a note that old links keep working.
    - `event-tabs.tsx`: tabs Detail, Kategori Tiket, Form Pemesan linking to `/admin/events/{id}`, `/admin/events/{id}/tickets`, `/admin/events/{id}/form` (the last two are built in Tasks 6 and 7; until then their tabs are not rendered).

- [ ] **Step 1: Write the failing test** `format.test.ts`: `toIsoFromLocal("2026-12-20T19:00", "Asia/Jakarta")` is `"2026-12-20T19:00:00+07:00"`; `toLocalInput("2026-12-20T12:00:00Z", "Asia/Makassar")` is `"2026-12-20T20:00"`; round trip for `Asia/Jayapura` returns the same local string.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `facilities.ts`, `format.ts` (date part), then `npm i @tiptap/react @tiptap/starter-kit @tiptap/pm` and the editor and pages.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Verify in the browser:** create an event with poster, rich description, facilities and schedule; reload shows the same values; rename the slug; 422 errors appear next to fields; keyboard-only use of the editor toolbar; 375 px and dark mode.
- [ ] **Step 6: Commit:** `feat(admin): event list and editor`.

### Task 6: Ticket categories

**Files:**
- Modify: `src/lib/validation/catalog.ts` (ticket category part)
- Create: `src/lib/catalog/ticket-category-service.ts`, `src/app/api/admin/events/[id]/ticket-categories/route.ts`, `src/app/api/admin/events/[id]/ticket-categories/[categoryId]/route.ts`, `src/app/api/admin/events/[id]/ticket-categories/reorder/route.ts`, `src/app/admin/(panel)/events/[id]/tickets/page.tsx`, `src/app/admin/(panel)/events/[id]/tickets/ticket-category-manager.tsx`
- Test: `tests/db/ticket-categories.test.ts`

**Interfaces:**
- Consumes: Task 2, Task 4 (`getAdminEvent`), `RichTextEditor`, `SortableList`.
- Produces:
  - `ticketCategoryInput` (zod): `name` 2..80; `description` HTML ≤ 20 000; `price` int ≥ 1000 ≤ 100 000 000; `capacity` int 0..1 000 000; `saleStartsAt` < `saleEndsAt` (ISO); `maxPerOrder` int 1..50 (default 5); `admitsPerUnit` int 1..20 (default 1); `hasMerchandise` boolean; `status` `draft|active|hidden`.
  - `type AdminTicketCategory = { id; name; description; price; capacity; sold; held; available; saleStartsAt; saleEndsAt; maxPerOrder; admitsPerUnit; hasMerchandise; status; position; inventoryId; everReserved: boolean }`.
  - Service:
    - `listTicketCategories(eventId)`.
    - `createTicketCategory(adminId, eventId, input)`: one transaction inserting the category (last position) and its `ticket_inventory` row for the event's default session.
    - `updateTicketCategory(adminId, eventId, categoryId, input)`: capacity goes through `update ticket_inventory set capacity = $c where id = $inv`; a `23514` check violation becomes `UserError("Kuota minimal {sold + held} (terjual + sedang dipesan).", 409, { capacity })` with the numbers read after the failure.
    - `reorderTicketCategories(adminId, eventId, ids)`.
    - `removeTicketCategory(adminId, eventId, categoryId)`: when any `hold_items` row references its inventory, throws `UserError("Kategori tiket ini sudah pernah dipesan. Sembunyikan saja.", 409)`; otherwise deletes inventory and category in one transaction.
    - Every write: audit + `invalidatePublic(TAG_EVENTS, eventTag(eventId))`.
  - Routes: `GET/POST /api/admin/events/{id}/ticket-categories`, `PATCH/DELETE …/{categoryId}`, `PUT …/reorder`. A `categoryId` that belongs to another event gives 404.
  - Admin tab: list with price, sale window, and a quota bar showing terjual / di-hold / tersedia; add/edit dialog; reorder; hide; delete with confirmation; badges "Bundle (isi N)" and "+ Merchandise".

- [ ] **Step 1: Write the failing tests** `ticket-categories.test.ts`:
  - `create adds inventory on the default session`: inventory capacity equals input, `sold 0`, `held 0`; a subsequent `reserve_tickets` works.
  - `capacity below sold plus held is rejected with a message` (Review Focus 2): with 3 held, setting capacity 2 gives 409 with `fields.capacity` and a message containing `3`; capacity 3 succeeds.
  - `refuses delete when used` (Review Focus 3): after one reserve (even released), delete gives 409 containing `Sembunyikan`; a never-reserved category is deleted together with its inventory.
  - `rejects price below 1000`: 422 `fields.price`.
  - `other event's category is 404`.
- [ ] **Step 2: Run** `npm run test:db -- ticket-categories`. Expected: FAIL.
- [ ] **Step 3: Implement** schema, service, routes, admin tab; render the "Kategori Tiket" tab in `event-tabs.tsx`.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Verify in the browser:** add Reguler, VIP, Bundle Couple (admits 2) with merchandise; reorder; lower capacity below held shows the message; 375 px and dark mode.
- [ ] **Step 6: Commit:** `feat(admin): ticket categories with inventory`.

### Task 7: Form builder

**Files:**
- Create: `src/lib/form-schema.ts`, `src/lib/catalog/form-field-service.ts`, `src/app/api/admin/events/[id]/form-fields/route.ts`, `src/app/api/admin/events/[id]/form-fields/[fieldId]/route.ts`, `src/app/api/admin/events/[id]/form-fields/reorder/route.ts`, `src/components/dynamic-form-fields.tsx`, `src/app/admin/(panel)/events/[id]/form/page.tsx`, `src/app/admin/(panel)/events/[id]/form/form-builder.tsx`
- Test: `tests/unit/form-schema.test.ts`, `tests/db/form-fields.test.ts`

**Interfaces:**
- Consumes: Task 2, `SortableList`, `Dialog`, `Field`, `Select`, `Checkbox`.
- Produces:
  - `FIELD_TYPES = ["short_text","long_text","number","date","select","radio","checkbox","chips","identity"] as const`; `IDENTITY_TYPES = [{ value: "KTP", label: "KTP" }, { value: "SIM", label: "SIM" }, { value: "PASPOR", label: "Paspor" }, { value: "KARTU_PELAJAR", label: "Kartu Pelajar" }]`.
  - `type FormFieldDef = { id: number; key: string; label: string; type: FieldType; options: Array<{ label: string; value: string }>; validation: FieldValidation; required: boolean; helpText: string | null; placeholder: string | null; isActive: boolean; position: number }` where `FieldValidation = { minLength?; maxLength?; pattern?; min?; max?; minDate?; maxDate?; minAge?; minSelected?; maxSelected?; identityTypes?: string[] }`.
  - `buildAnswersSchema(fields: FormFieldDef[]): z.ZodObject` over active fields, keyed by `key`, Indonesian messages:
    - text types: trimmed strings with min/max length and `pattern`;
    - `long_text` max default 2000;
    - `number`: coerced number with min/max;
    - `date`: `YYYY-MM-DD` with minDate/maxDate and `minAge` (full years at today's date in Asia/Jakarta);
    - `select`/`radio`/`chips`: one of the option values;
    - `checkbox`: array of option values with minSelected/maxSelected;
    - `identity`: `{ type, number }` with `type` in `identityTypes` (default all four); `KTP` requires exactly 16 digits, other types 5–20 letters or digits;
    - not required: empty string, empty array or missing becomes `undefined`.
  - `fieldKeyFromLabel(label: string, taken: string[]): string`: snake_case ASCII from the label (`"Ukuran Baju"` gives `ukuran_baju`), suffix `_2`, `_3` when taken, fallback `field`.
  - `formFieldInput` (zod) for admin writes, with a type-specific validation object, options required (≥ 1, unique values) for select/radio/checkbox/chips, `pattern` must compile as a JS RegExp.
  - Service: `listFormFields(eventId)`, `createFormField(adminId, eventId, input)` (key from label when not given; duplicate key gives 409 `fields.key`), `updateFormField(adminId, eventId, fieldId, input)` (when the field has answers: `type` and `key` cannot change, 409), `reorderFormFields`, `removeFormField` (with answers: `UserError("Field ini sudah punya jawaban. Nonaktifkan saja.", 409)`). Every write: audit + `invalidatePublic(eventTag(eventId))`.
  - `DynamicFormFields` (client): renders `FormFieldDef[]` with values/errors/onChange, used by the builder preview now and by checkout in Fase 2. Chips render as a radio group styled as buttons; identity renders a type select plus a number input (KTP: `inputMode="numeric"`, max 16).
  - Admin tab: field list with drag reorder, active toggle, add (choose type), edit dialog (label, key, help text, placeholder, required, type-specific settings, options editor), and a live preview with a "Uji isian" button that validates the preview values with `buildAnswersSchema`.

- [ ] **Step 1: Write the failing unit tests** `form-schema.test.ts`:
  - `KTP needs exactly 16 digits`: `3201234567890001` passes; 15 digits and letters fail with an Indonesian message.
  - `identity limited to KTP`: with `identityTypes: ["KTP"]`, type `SIM` fails.
  - `other identity types allow 5 to 20 letters or digits`.
  - `min age`: with `minAge: 17`, a birth date 16 years ago fails, 18 years ago passes.
  - `checkbox min and max selected`; `select rejects unknown option`; `optional empty becomes undefined`; `inactive fields are ignored`; `pattern applied to short text`.
  - `fieldKeyFromLabel`: `"Ukuran Baju"` gives `ukuran_baju`; with `["ukuran_baju"]` taken gives `ukuran_baju_2`; `"!!!"` gives `field`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `form-schema.ts`. Run `npm test`. Expected: PASS.
- [ ] **Step 4: Write the failing DB tests** `form-fields.test.ts`: create with generated key; duplicate key 409; `refuses delete when used` (Review Focus 3, an `order_answers` row created through `checkoutHold` with that field); type change refused when answered; reorder.
- [ ] **Step 5: Run** `npm run test:db -- form-fields`. Expected: FAIL. **Implement** service, routes, `DynamicFormFields` (`npm i @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` if Task 1 has not already), admin tab; render the "Form Pemesan" tab. **Run** again. Expected: PASS.
- [ ] **Step 6: Verify in the browser:** build a form with Ukuran Baju (chips XS–XXXL), Jenis Kelamin (radio), Tanggal Lahir (min age 17), Identitas (hanya KTP); preview validation messages appear next to fields; reorder by mouse and keyboard; 375 px and dark mode.
- [ ] **Step 7: Commit:** `feat(admin): form builder with shared answer schema`.

### Task 8: Settings and email provider

**Files:**
- Create: `src/lib/validation/settings.ts`, `src/lib/settings-service.ts`, `src/lib/email/email-provider.ts`, `src/app/api/admin/settings/[group]/route.ts`, `src/app/api/admin/settings/smtp/test/route.ts`, `src/app/admin/(panel)/settings/page.tsx`, `src/app/admin/(panel)/settings/settings-tabs.tsx`
- Modify: admin nav (add "Pengaturan")
- Test: `tests/unit/email-provider.test.ts`, `tests/db/settings.test.ts` (extend)

**Interfaces:**
- Consumes: Task 2, `encrypt`/`decrypt`, `RichTextEditor`, `ImageUpload`.
- Produces:
  - `transactionSettings` (zod): `holdMinutes` 1..30, `payMinutes` 5..1440, `payGraceMinutes` 0..60, `serviceFee` 0..1 000 000, `paymentMethods: { qris: boolean; va: Record<"bca"|"bni"|"bri"|"mandiri"|"permata"|"cimb", boolean> }`.
  - `siteSettings`: `name` 2..60, `logoPath` media base path or null, `csWhatsapp` empty or `62` + 8..13 digits (input accepts `08…` / `+62…` and normalizes), `csEmail` empty or email, `terms` and `privacy` HTML (sanitized).
  - `smtpSettingsInput`: `host` ≤ 200, `port` 1..65535, `user` ≤ 200, `password` optional (empty keeps the stored one), `from` email or `Name <email>`.
  - `PAYMENT_METHODS = [{ key: "qris", code: "other_qris", label: "QRIS" }, { key: "bca", code: "bca_va", label: "BCA" }, { key: "bni", code: "bni_va", label: "BNI" }, { key: "bri", code: "bri_va", label: "BRI" }, { key: "mandiri", code: "echannel", label: "Mandiri" }, { key: "permata", code: "permata_va", label: "Permata" }, { key: "cimb", code: "cimb_va", label: "CIMB Niaga" }]` (codes verified in sandbox, design doc §2).
  - `getSettingsGroup(group: "transaction" | "site" | "smtp")`: smtp returns `{ host, port, user, from, hasPassword }`, never the password.
  - `putSettingsGroup(adminId, group, input)`: transaction writes the five keys; site writes `site` and sets `privacy_updated_at` to now only when the privacy text changed; smtp writes `value` without the password and `secret_enc = encrypt(password)` when a new password is given. Audit (smtp diff never contains the password). Site writes call `invalidatePublic(TAG_SITE)`.
  - `type EmailMessage = { to: string; subject: string; html: string; text: string }`; `interface EmailProvider { send(msg: EmailMessage): Promise<{ messageId: string }> }`.
  - `resolveSmtpConfig(stored: { host?; port?; user?; from?; password?: string | null } | null, env: Env): SmtpConfig | null`: stored settings win when host and password are present, otherwise the `SMTP_*` env values, otherwise null. `secure = port === 465`.
  - `getEmailProvider(): Promise<EmailProvider>` (nodemailer transport from the resolved config; throws `UserError("SMTP belum diatur. Isi di Pengaturan > Email.", 400)` when null).
  - Routes: `GET/PUT /api/admin/settings/{group}`; `POST /api/admin/settings/smtp/test` with `{ to }` sends "Uji SMTP Anytix" and returns `{ messageId }`, or 502 `{ error: "Gagal mengirim: <server response>" }`.
  - Admin page `/admin/settings` with tabs Transaksi (numbers with units, payment method toggles), Situs (name, logo, CS contacts, S&K, Kebijakan Privasi), Email (SMTP fields, password placeholder "Tersimpan. Kosongkan bila tidak diubah.", "Kirim email uji" with recipient input and the result message).

- [ ] **Step 1: Write the failing unit tests** `email-provider.test.ts`: stored complete config wins over env; stored without password falls back to env; neither gives null; port 465 gives `secure true`, 587 gives false.
- [ ] **Step 2: Write the failing DB tests** (extend `settings.test.ts`; restore every touched setting in `afterAll`): `holdMinutes 31 is rejected` (422 `fields.holdMinutes`); `smtp password is stored encrypted and never returned`; `empty password keeps the stored one`; `privacy timestamp changes only with the privacy text`.
- [ ] **Step 3: Run** `npm test` and `npm run test:db -- settings`. Expected: FAIL.
- [ ] **Step 4: Implement** (`npm i nodemailer`, `npm i -D @types/nodemailer`) schemas, service, provider, routes, page.
- [ ] **Step 5: Run** both. Expected: PASS.
- [ ] **Step 6: Verify in the browser:** change hold minutes and service fee, reload shows them; toggle a bank off; save SMTP from `.env.local` values through the form, then "Kirim email uji" to `pewhas@tempverify.com` (the owner's test inbox) shows a message id; 375 px and dark mode.
- [ ] **Step 7: Commit:** `feat(admin): transaction, site and SMTP settings with test email`.

### Task 9: Public data layer

**Files:**
- Create: `src/lib/public/catalog-queries.ts`, `src/lib/ticket-status.ts`, `src/app/api/events/[slug]/availability/route.ts`
- Modify: `src/lib/format.ts` (`formatRupiah`, `formatEventSchedule`)
- Test: `tests/unit/ticket-status.test.ts`, `tests/unit/format.test.ts` (extend), `tests/db/catalog-queries.test.ts`

**Interfaces:**
- Consumes: Task 2 tags, Tasks 3–8 data.
- Produces:
  - `ticketBadge(input: { status: string; capacity: number; sold: number; held: number; saleStartsAt: Date; saleEndsAt: Date; eventSaleStatus: string }, now: Date): { label: "On Sale" | "Hampir habis" | "Sold Out" | "Segera dibuka" | "Penjualan ditutup"; tone: "accent" | "warning" | "muted"; buyable: boolean; remaining: number }`, in this order of precedence: event sale status `closed` or `now > saleEndsAt` gives Penjualan ditutup; `paused` or `now < saleStartsAt` gives Segera dibuka; remaining ≤ 0 gives Sold Out; remaining ≤ max(10% of capacity, 10) gives Hampir habis; otherwise On Sale.
  - `formatRupiah(n: number): string` (`Rp135.000`); `formatEventSchedule(startsAt: Date, endsAt: Date, tz: Timezone): { date: string; time: string }` (`"Sabtu, 20 Desember 2026"`, `"19.00 – 22.00 WIB"`; multi-day ranges show both dates).
  - Every query below starts with `'use cache'`, calls `cacheLife(PUBLIC_CACHE)` with `PUBLIC_CACHE = { stale: 300, revalidate: 60, expire: 3600 }` (`revalidate` gives `s-maxage=60` as PRD §17 asks; `stale` below 300 keeps the data out of the App Shell, see HANDOFF), and `cacheTag(...)`:
    - `getPublicCategories()`: active categories with a published event count. Tags `categories`, `events`.
    - `getHomeEvents()`: `{ featured: PublicEventCard[]; upcoming: PublicEventCard[] }` (featured published events, then up to 8 upcoming published events by `starts_at`). Tag `events`.
    - `searchPublicEvents({ category?: string; q?: string; page: number }): Promise<{ items: PublicEventCard[]; total: number; pageSize: 12 }>` (published, not ended, `q` matches title, city, venue case-insensitively). Tag `events`.
    - `getPublicEvent(eventId: number): Promise<PublicEvent | null>` (published only; includes active ticket categories with inventory, `minPrice` over active categories, facilities, organizer, social links, seo). Tags `events`, `event-<id>`.
    - `resolvePublicSlug(slug: string): Promise<{ eventId: number; currentSlug: string; redirected: boolean } | null>` (published events only). Tag `events`.
    - `getPublicSite(): Promise<{ name; logoPath; csWhatsapp; csEmail; terms; privacy }>`. Tag `site-settings`.
    - `getPublishedSlugs(): Promise<string[]>` for the sitemap and `generateStaticParams`. Tag `events`.
  - `type PublicEventCard = { id; slug; title; posterPath; startsAt; endsAt; timezone; city; venue; organizerName; minPrice: number | null; categorySlug; categoryName }`.
  - `GET /api/events/{slug}/availability`: dynamic, not `'use cache'`; returns `{ categories: Array<{ id; inventoryId; badge: ReturnType<typeof ticketBadge> }> }` with `cache-control: public, s-maxage=3, stale-while-revalidate=2` and a 3-second in-process memo per event (`shortcut:` comment: per instance).
  - Tests import these queries outside Next; `tests/setup.ts` mocks `next/cache` so `'use cache'`-free calls of `cacheLife`/`cacheTag` are no-ops and `revalidateTag` records tags in `globalThis.__revalidatedTags` (Task 2 already relies on this for invalidation assertions).

- [ ] **Step 1: Write the failing unit tests**
  - `ticket-status.test.ts`: one case per label and precedence (closed beats sold out; Segera dibuka before start even if sold out is impossible to buy; capacity 50 with 5 remaining gives Hampir habis; capacity 1000 with 90 remaining gives Hampir habis (≤ 10%), with 101 remaining gives On Sale).
  - `format.test.ts`: `formatRupiah(135000)` is `"Rp135.000"`; a same-day range in WITA gives `"19.00 – 22.00 WITA"`; a two-day range lists both dates.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL. **Implement** `ticket-status.ts` and the format helpers. **Run** again. Expected: PASS.
- [ ] **Step 3: Write the failing DB tests** `catalog-queries.test.ts`:
  - `draft event is not public` (Review Focus 5): `getPublicEvent` is null and `resolvePublicSlug` is null for a draft and for an archived event.
  - `min price ignores hidden categories` (Review Focus 5): categories 100 000 (active), 50 000 (hidden), 75 000 (draft) give `minPrice 100000`; no active category gives `null`.
  - `search filters by category and text`; `ended events are excluded from search and upcoming`.
  - `availability reflects held tickets`: after a reserve of all but 3 units of capacity 50, the endpoint badge is Hampir habis with `remaining 3`.
- [ ] **Step 4: Run** `npm run test:db -- catalog-queries`. Expected: FAIL. **Implement** the queries and the route. **Run** again. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(public): cached catalog queries, ticket badges, availability endpoint`.

### Task 10: Public pages

**Files:**
- Create: `src/app/(public)/layout.tsx`, `src/app/(public)/page.tsx`, `src/app/(public)/events/page.tsx`, `src/app/(public)/events/[slug]/page.tsx`, `src/app/(public)/events/[slug]/event-tabs.tsx`, `src/app/(public)/events/[slug]/refund-dialog.tsx`, `src/app/(public)/events/[slug]/tickets/page.tsx`, `src/app/(public)/events/[slug]/tickets/ticket-picker.tsx`, `src/app/(public)/terms/page.tsx`, `src/app/(public)/privacy/page.tsx`, `src/components/event-card.tsx`, `src/components/media-image.tsx`, `src/lib/image-loader.ts`, `src/app/sitemap.ts`, `src/app/robots.ts`
- Modify: `next.config.ts` (`images.loaderFile`), move the Fase 0 `src/app/page.tsx` into `(public)`

**Interfaces:**
- Consumes: Task 9 queries, `ticketBadge`, `formatRupiah`, `formatEventSchedule`, `FACILITIES`, Task 1 components.
- Produces:
  - `image-loader.ts` (`'use client'`, set as `images.loaderFile`): `({ src, width }) =>` data/http(s) URLs unchanged; a media base path gives `mediaUrl(src, width <= 400 ? "thumb" : width <= 800 ? "md" : "lg")`. `MediaImage` wraps `next/image` with `alt`, `sizes`, `width`/`height` and lazy loading.
  - `(public)/layout.tsx`: `SiteHeader` (text logo "Anytix" linking to `/`, link "Jelajah Event" to `/events`, theme toggle) and `SiteFooter` (site name, CS WhatsApp/email when set, links to `/terms` and `/privacy`). The site settings read sits in a component inside `<Suspense>` only if it is not cached; `getPublicSite()` is cached so it can render in the static shell.
  - `/`: featured events (only when any are featured), category chips linking to `/events?category=<slug>`, upcoming events grid; empty state "Belum ada event yang dibuka. Cek lagi nanti." when nothing is published.
  - `/events`: search box (`q`) and category filter as a GET form, results grid with `EventCard` (poster, title, schedule, city, "Mulai dari Rp…", organizer), pagination links; `searchParams` read inside `<Suspense>` with a skeleton grid fallback; empty state names the filter and offers "Hapus filter".
  - `/events/[slug]`:
    - `generateStaticParams` returns `getPublishedSlugs()` or `[{ slug: "__none__" }]` when empty (an empty array is a build error).
    - Slug resolution runs at the top of the page, before any `<Suspense>`, so an unknown slug returns a real 404 via `notFound()` and an old slug returns `permanentRedirect("/events/<current>")` (HTTP 308, the permanent equivalent the framework emits for PRD §16's "redirect 301").
    - Content: category tag, title, organizer (name + logo), social links, tabs Deskripsi / Syarat & Ketentuan / Fasilitas (keyboard-operable tablist), "Kebijakan Refund" link opening a `<dialog>`, poster, Detail Acara (date, time with WIB/WITA/WIT, venue, city, province, "Buka peta" link when `mapUrl`), "Harga mulai dari", "Pesan Sekarang" linking to `/events/<slug>/tickets` (shown only when some category is buyable; otherwise the badge reason is shown instead).
    - `generateMetadata` uses the cached event (SEO title/description fallback to title/plain description, OG image = poster `lg`), and JSON-LD `Event` (`name`, `startDate`, `endDate`, `location` Place with address, `image`, `offers` with `lowPrice` and `priceCurrency IDR`, `organizer`) in a native `<script type="application/ld+json">` with `<` escaped.
  - `/events/[slug]/tickets`: same slug resolution; ticket cards (name, price, collapsible description, badges "+ Merchandise" and "Bundle (isi N)", status badge), "Pilih" then a quantity stepper capped by `min(maxPerOrder, remaining)`, sidebar "Rincian Pesanan" (items, subtotal, total item). Live badges come from the availability endpoint (client fetch on mount and every 15 s while visible). "Beli Sekarang" is rendered disabled with the visible note "Pembayaran dibuka di tahap berikutnya" (R-26: no dead control without a label; Fase 2 wires it).
  - `/terms`, `/privacy`: site settings text, `noindex` not needed; empty text shows "Belum diisi pengelola."
  - `sitemap.ts`: `/`, `/events`, every published event and its tickets page. `robots.ts`: allow all, disallow `/admin`, `/checkout`, `/orders`, `/api`, sitemap URL from `APP_URL`.
  - `loading.tsx` skeletons for `/events` and event pages; `error.tsx` per segment with a retry button.

- [ ] **Step 1: Load** `antislop:antislop-human` and `antislop:antislop-layoutmobile`; declare the Design Read line in the ledger.
- [ ] **Step 2: Implement** the loader, layout, pages, sitemap and robots.
- [ ] **Step 3: Run** `npm run build`. Expected: success with `/events/[slug]` listed as prerendered or partial, no "uncached data accessed outside Suspense" errors.
- [ ] **Step 4: Verify with curl** against `npm run start`: `/events/<old-slug>` returns 308 with `location` to the current slug; `/events/tidak-ada` returns 404; `/events/<slug>` has `cache-control` containing `s-maxage=60`; `/` and `/events/<slug>` responses have no `set-cookie`.
- [ ] **Step 5: Verify in the browser** (Playwright): home, list with search and category filter, detail tabs by keyboard, refund dialog opens and closes with Escape, tickets page stepper limits, live badge after a reserve from a test script; 375 px and 1280 px; light and dark; check every text/background pair with the contrast tool; no console errors.
- [ ] **Step 6: Commit:** `feat(public): home, event list, event detail and ticket selection pages`.

### Task 11: Fase 1 checkpoint

- [ ] **Step 1:** `npm test`, `npm run test:db`, `npm run lint`, `npm run build` all pass.
- [ ] **Step 2:** End-to-end in the browser as `admin@admin.com`: create category, create event with poster and description, add three ticket categories (one Bundle), build a form with an identity field, set transaction settings, publish, open the public pages and see everything; rename the slug and confirm the old URL redirects.
- [ ] **Step 3:** AGENTS.md comment check (same grep as Fase 0 Task 10) and the antislop Delivery Gate report for the public pages.
- [ ] **Step 4:** Final whole-phase review by a fresh reviewer; fix Critical/Important with RED→GREEN tests.
- [ ] **Step 5:** Commit and push to `main` right away (owner rule), then report to the owner in Indonesian.
