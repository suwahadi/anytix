# Serah terima pengerjaan Anytix

Terakhir diperbarui: 17 Oktober 2026, di akhir Fase 1. Dokumen ini untuk agent AI berikutnya. Baca seluruhnya sebelum menulis kode.

## Sumber kebenaran

- `PRD.md`: kebutuhan produk.
- `docs/superpowers/specs/2026-10-17-anytix-mvp-design.md`: keputusan desain yang disetujui pemilik, termasuk arah visual dan dial `ENERGY 1 / RHYTHM 2 / MOTION 1`.
- `docs/superpowers/plans/2026-10-17-fase-0-fondasi.md` dan `docs/superpowers/plans/2026-10-17-fase-1-katalog-admin.md`: dua fase yang sudah selesai. Kotak centang di file plan tidak diperbarui; status sebenarnya ada di dokumen ini.
- `anti-slop/audit-001-2026-10-17.md`: audit antislop halaman publik (Delivery Gate bersih).
- `AGENTS.md`: aturan proyek dan aturan pemilik.

Ruang lingkup yang disepakati adalah Fase 0–3. Pengerjaan berhenti di akhir tiap fase.

## Status

| Bagian | Status |
|---|---|
| Fase 0 (fondasi, engine anti-oversell, worker) | Selesai dan di-push |
| Fase 1 (katalog, admin, halaman publik) | Selesai: checkpoint Task 11, review menyeluruh dan audit antislop sudah dikerjakan, lalu di-push |
| Fase 2 | Belum ada plan |
| Fase 3 | Belum ada plan |

Hasil test terakhir: `npm test` 79 lulus, `npm run test:db` 121 lulus, `lint`, `tsc` dan `build` bersih.

## Langkah berikutnya

1. Buat plan Fase 2 dari PRD (§8–§15 dan §23) dengan format yang sama seperti plan Fase 1, lalu jalankan task per task dengan TDD.
2. Masukkan "Bawaan untuk Fase 2" di bawah ke plan itu.
3. Di akhir fase: checkpoint seperti Task 11 Fase 1, lalu commit dan push ke `main`.

## Bawaan untuk Fase 2

Sisa temuan review akhir Fase 1 (Minor), ditambah hal yang ditemukan saat checkpoint. Belum dikerjakan:

- Engine `reserve_tickets` tidak menolak event yang sudah berakhir. Ia hanya memeriksa status terbit, status sesi dan jendela jual kategori. Badge UI sudah menutup penjualan setelah `ends_at`, tetapi penjagaan sebenarnya harus ada di engine atau di endpoint reserve.
- Checkout harus memeriksa ulang ketersediaan di server. Data publik memakai `stale: 300`, jadi navigasi di sisi klien bisa menampilkan badge sampai 5 menit lebih lama.
- `settings-service.ts`: mengganti host SMTP tanpa mengisi ulang password tetap memakai password lama. Sesi admin yang dibajak bisa mengarahkannya ke server sendiri. Wajibkan password diisi ulang saat host berubah.
- `smtp/test/route.ts`: `site.name` masuk ke HTML email tanpa di-escape.
- `mediaPath` di `validation/catalog.ts` menerima string apa saja. Validasi dengan format hasil upload (`^(poster|logo|icon)/\d{4}/[A-Za-z0-9_-]+$`).
- FK violation masih menjadi 500: `eventCategoryId` yang tidak ada, dan reserve yang masuk di antara cek `everReserved` dan delete di `removeTicketCategory`. Petakan SQLSTATE 23503 ke 422/409.
- Pengaturan transaksi membolehkan semua metode bayar dimatikan. Wajibkan minimal satu sebelum checkout dibuat.
- `formFieldInput` menerima min > max (panjang, pilihan, angka, tanggal). `pattern` dari admin akan dijalankan ke input pembeli: waspadai regex yang bisa membuat event loop macet.
- `src/app/layout.tsx` memakai template judul tetap `%s · Anytix`, bukan nama situs dari pengaturan.
- Rename slug kategori tidak punya redirect, dan event di kategori tersembunyi tetap muncul di beranda dan pencarian. Spec belum mengatur keduanya; tanyakan ke pemilik bila relevan.
- Gambar yang diganti atau dihapus tetap tersimpan di Supabase Storage. File poster uji E2E dari checkpoint juga masih ada di sana.
- Di `next dev` (bukan produksi), setiap halaman 404 memuat ulang dirinya sendiri terus-menerus, termasuk 404 global. Di `next start` hanya satu request. Belum diselidiki.

## Keputusan Fase 1 di luar teks plan

- Tidak ada `loading.tsx` di bawah `src/app/(public)/events/`. Resolusi slug (`load-event.ts`) harus berjalan di luar Suspense agar 404 dan 308 punya status HTTP asli.
- `/events/[slug]` dan `/events/[slug]/tickets` mengekspor `ensureStatic = "navigation"`, karena tanpa itu slug di luar `generateStaticParams` mendapat fallback shell berstatus 200. Keduanya juga mengekspor `instant = false`, karena `params` sengaja dibaca sebelum Suspense.
- `PUBLIC_CACHE` memakai `stale: 300`. Nilai di bawah 5 menit membuat data `use cache` keluar dari App Shell, sehingga navigasi publik menunggu server. Validator dev menandainya sebagai "URL data". `revalidate: 60` tetap menghasilkan `s-maxage=60`. Jangan turunkan `stale` di bawah 300.
- Cukup satu `error.tsx` di `(public)` dan satu `not-found.tsx` global.
- `MediaImage` tidak dibuat; `next/image` memakai `images.loaderFile` global (`src/lib/image-loader.ts`).
- Badge tiket di halaman detail dihitung di dalam `getPublicEvent` (`'use cache'`). Halaman tiket memperbarui badge dari `/api/events/{slug}/availability` tiap 15 detik. Kategori yang hilang dari respons itu dianggap tutup.
- Stepper memakai `aria-disabled` agar fokus keyboard tidak hilang di batas jumlah.
- "Orang per tiket" terkunci setelah kategori pernah dipesan, karena `issue_tickets` menghitung QR dari nilai saat itu.
- Key field form yang dibuat otomatis diberi awalan `f_` bila diawali angka. Pola key ada di satu tempat, yaitu `FIELD_KEY_PATTERN` di `src/lib/form-schema.ts`.
- Semua tautan, tombol dan tab memakai `cursor: pointer` lewat `@layer base` di `globals.css` (permintaan pemilik). Aturan kursor jangan ditaruh di luar layer, karena akan mengalahkan `cursor-not-allowed`.
- Target sentuh minimal 44 px (`inline-flex min-h-11 items-center` untuk tautan teks).

## Lingkungan dan jebakan

- `.env.local` tidak ada di repo dan disalin pemilik. Pastikan namanya `.env.local` (dengan titik), karena `env.local` tidak dibaca Next dan tidak di-gitignore. `NEXT_PUBLIC_MEDIA_BASE_URL` = `SUPABASE_URL` + `/storage/v1/object/public/media`.
- Jam Windows harus sinkron. Selisih 30 detik membuat 3 test DB gagal (`reserve`, `checkout`, `jobs`), karena test membandingkan `Date.now()` dengan waktu database. Cek dengan `curl -sI https://www.google.com | grep -i date` lalu bandingkan dengan `date -u`. Perbaikannya di PowerShell Administrator: `Start-Service w32time; w32tm /resync /force`.
- `next dev` menulis ulang semua isi blok `<!-- BEGIN:nextjs-agent-rules -->` di `AGENTS.md`. Aturan proyek harus berada di luar blok itu.
- Database adalah Supabase dev bersama, dipakai juga oleh test DB. `DATABASE_URL` memakai pooler `aws-0-ap-southeast-1:6543`.
- Supavisor membuang query yang di-pipeline (`max_pipeline: 0`). Transaksi memakai helper `transaction()`; untuk SQL ad hoc, `npx tsx --env-file=.env.local scripts/apply-sql.ts <file.sql>` menjalankan file dalam satu transaksi.
- Test DB wajib lewat `npm run test:db` (`--no-file-parallelism`). `schema.test.ts` mengharapkan kategori seed yang persis, jadi kategori uji harus dihapus setelah dipakai.
- Hapus data event uji dengan urutan FK: `hold_items` → `holds` → `slug_redirects` → `form_fields` → `ticket_inventory` → `ticket_categories` → `event_sessions` → `events`. Admin uji: `audit_logs` dulu, baru `admins`.
- Skrip yang mengimpor `@/…` harus berada di dalam folder proyek (misalnya `scripts/_x.mts`, lalu hapus). Dari folder lain, modul tidak ditemukan. Skrip dengan top-level await harus `.mts`.
- Di Windows, menghentikan `npm run start`/`next dev` dari task latar belakang bisa menyisakan proses `node` yang tetap memegang port. Cek port dan matikan prosesnya sebelum build ulang, karena build saat server lama masih jalan menghasilkan uji yang menyesatkan.
- Di Windows, dev server Turbopack kadang memakai modul lama setelah file lib diubah. Restart dev server.
- Playwright: request prefetch RSC tampak menggantung karena router Next sengaja membatalkannya (`ERR_ABORTED` setelah 200). Pakai `waitUntil: 'load'`, bukan `networkidle`. Screenshot dan log disimpan di `.playwright-mcp/` (di-gitignore).
- Next.js 16.4 dengan `cacheComponents` dan `partialPrefetching`. Baca `node_modules/next/dist/docs/` sebelum menulis kode: `proxy.ts` menggantikan middleware, data runtime harus di dalam `<Suspense>`, invalidasi dari Route Handler memakai `revalidateTag(tag, { expire: 0 })`, `generateStaticParams` minimal satu entri, `priority` diganti `preload`, dan lihat `ensureStatic`, `instant` serta ambang `cacheLife`.

## Data di database dev

- Event contoh: "Jazz di Taman 2026" (id 645, slug `jazz-taman-2026`, published, on sale) dengan 3 kategori tiket dan 4 field form.
- Admin hanya `admin@admin.com` milik pemilik, dengan 2FA aktif. Jangan diubah. Untuk uji browser, buat admin sementara dengan `ADMIN_PASSWORD=… npm run admin:create -- nama@anytix.test`, lalu hapus setelah selesai.
- Pengaturan SMTP tersimpan di tabel `settings` (password terenkripsi). Pengaturan transaksi bernilai default (kunci slot 3 menit, batas bayar 15 menit, cadangan 5 menit, biaya layanan Rp5.000, semua metode aktif).

## Ledger Fase 1 (Task 1–9)

Salinan dari `.superpowers/sdd/2026-10-17-fase-1-katalog-admin/progress.md` (di-gitignore).

```text
Setup: work directly on main; no worktree.
Task 1: SortableList renderItem receives a ready drag-handle element. src/lib/media.ts with NEXT_PUBLIC_MEDIA_BASE_URL; storage.ts re-exports mediaUrl. Fixed Fase 0 bug: 2FA 'Kembali' re-submitted the login form (distinct form keys). Admin mobile nav is a client MobileMenu (<details>) closing on link click and Escape.
Task 2: next/cache mock lives in tests/setup.ts (records revalidateTag calls in globalThis.__revalidatedTags). Added diffFields helper for audit diffs.
Task 3: requestJson failure carries `fields` (422 field errors). Category row hides the icon below sm and wraps names.
Task 4: facilities.ts created in Task 4 (eventInput needs the keys). Added test 'rejects a slug used by another event'.
Task 5: Tiptap loads via next/dynamic ssr:false (Math.random during prerender). event-form.tsx shared by new and [id]; edit page wraps a client component using useParams in Suspense. Event list is a responsive list, not a table.
Task 6: formatRupiah moved to Task 6. Capacity CHECK violation mapped only when table_name is ticket_inventory ('Kuota minimal N (terjual + sedang dipesan).'). Admin EventTabs takes an explicit `active` prop; tabs nav has overflow-y-hidden.
Task 7: test helper keeps the first issue per field (same as adminRoute). Stale dev-server modules caused hydration mismatches; restart the dev server.
Task 8: settings split into /admin/settings, /admin/settings/site, /admin/settings/email with settings-nav.tsx. SMTP password guidance is a hint, not a placeholder. validationResponse() extracted from adminRoute. DB tests only via npm run test:db. Test email to the owner's inbox succeeded.
Task 9: ticketBadge treats a non-active category as 'Penjualan ditutup'. Featured events capped at 6, ended events excluded; category counts only published, not-ended events. Search escapes %, _ and \. getPublicSite() returns the full SiteView. Availability route does not call connection() (throws in tests; [slug] handler is never prerendered) — confirmed by the Task 10 build.
```
