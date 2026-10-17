# Serah terima pengerjaan Anytix

Terakhir diperbarui: 17 Oktober 2026. Dokumen ini untuk agent AI berikutnya yang melanjutkan pekerjaan di mesin lain. Baca seluruhnya sebelum menulis kode.

## Sumber kebenaran

- `PRD.md`: kebutuhan produk.
- `docs/superpowers/specs/2026-10-17-anytix-mvp-design.md`: keputusan desain yang sudah disetujui pemilik.
- `docs/superpowers/plans/2026-10-17-fase-0-fondasi.md`: Fase 0 (selesai).
- `docs/superpowers/plans/2026-10-17-fase-1-katalog-admin.md`: Fase 1 (sedang berjalan). Kotak centang di file plan **tidak** diperbarui. Status sebenarnya ada di dokumen ini.
- `AGENTS.md`: aturan proyek untuk semua agent, termasuk aturan pemilik.

Ruang lingkup yang disepakati adalah Fase 0–3. Pengerjaan berhenti di akhir tiap fase. Fase 2 dan 3 belum punya plan, jadi buat plan baru dengan format yang sama seperti plan Fase 1.

## Status

| Bagian | Status |
|---|---|
| Fase 0 (fondasi, engine anti-oversell, worker) | Selesai, sudah di-review dan di-push |
| Fase 1 Task 1–9 | Selesai, semua test lulus, sudah dicek di browser |
| Fase 1 Task 10 (halaman publik) | Selesai. Langkah 4 (curl) lulus setelah perbaikan `ensureStatic`, langkah 5 (browser) lulus tanpa perubahan kode |
| Fase 1 Task 11 (checkpoint) | Belum |

Hasil test terakhir: `npm test` 74 lulus (ditambah 2 test `toPlainText` di Task 10), dan `npm run test:db` 112 lulus sebelum Task 9 ditambah 7 test `catalog-queries`.

## Langkah berikutnya, berurutan

### 1. Task 10 langkah 4: uji dengan curl ke server produksi (selesai)

Matikan dulu dev server (port 3000). Lalu jalankan `npm run build && npm run start`.

Buat slug lama sementara untuk menguji redirect, lalu hapus lagi setelah selesai:

```sql
insert into slug_redirects (old_slug, event_id) values ('jazz-taman-lama', 645);
delete from slug_redirects where old_slug = 'jazz-taman-lama';
```

Yang harus terbukti:

- `/events/jazz-taman-lama` memberi 308 dengan `location: /events/jazz-taman-2026`.
- `/events/jazz-taman-lama/tickets` memberi 308 ke `/events/jazz-taman-2026/tickets`.
- `/events/tidak-ada` dan `/events/tidak-ada/tickets` memberi 404 asli, bukan 200.
- `/events/jazz-taman-2026` punya `cache-control` yang mengandung `s-maxage=60`.
- `/`, `/events` dan `/events/<slug>` tidak mengirim `set-cookie`.
- `/robots.txt` dan `/sitemap.xml` berisi URL dari `APP_URL`.

### 2. Task 10 langkah 5: cek di browser (selesai)

Hasil: 8 halaman × 375/1280 px × terang/gelap tanpa overflow horizontal, gambar rusak, atau error konsol (kecuali laporan 404 bawaan browser di `/events/tidak-ada`). Kontras terendah 4.84 (`#b45309` di atas `#fffbeb`, badge "Hampir habis"). Badge berubah tanpa reload setelah 20 hold dari skrip, lalu kembali setelah hold dilepas. Request prefetch RSC yang tampak "menggantung" di Playwright adalah stream yang sengaja dibatalkan router Next (`ERR_ABORTED` setelah 200), jadi pakai `waitUntil: 'load'`, bukan `networkidle`.


Gunakan Playwright di 375 px dan 1280 px, dalam mode terang dan gelap. Yang dicek:

- Beranda, lalu `/events` dengan pencarian dan filter kategori, termasuk empty state "Hapus filter".
- Tab di halaman detail dioperasikan dengan keyboard (panah kiri/kanan, Home, End).
- Dialog Kebijakan Refund terbuka, lalu tertutup dengan Escape. Isi dulu kebijakan refund event 645 di admin, karena tautan hanya tampil kalau isinya ada.
- Batas stepper di halaman tiket.
- Badge berubah setelah reserve dari skrip uji (`reserveTickets` di `src/lib/hold-service.ts`), dengan refresh tiap 15 detik.
- Setiap pasangan teks dan latar dicek dengan contrast checker antislop.
- Konsol tanpa error.

### 3. Commit Task 10 (selesai)

Perbaikan dari langkah 1 ada di commit `fix(public): real 404 and 308 for unlisted event slugs`.

### 4. Task 11: checkpoint Fase 1

Ikuti plan.

1. Jalankan `npm test`, `npm run test:db`, `npm run lint` dan `npm run build`.
2. Uji end-to-end sebagai admin.
3. Cek komentar sesuai `AGENTS.md` dan jalankan Delivery Gate antislop.
4. Minta review menyeluruh oleh reviewer baru, lalu perbaiki temuan Critical/Important dengan test RED→GREEN.
5. Commit dan **langsung push ke `main`**, lalu lapor ke pemilik dalam Bahasa Indonesia.

Bersih-bersih di checkpoint:

- Hapus admin sementara `verify-temp@anytix.test` dari tabel `admins`, termasuk baris `audit_logs` miliknya.
- Hapus dokumen ini, atau perbarui untuk fase berikutnya.

### 5. Fase 2 dan Fase 3

Buat plan baru dari PRD (§8–§15 dan §23). Jalankan task per task dengan TDD.

## Keputusan Task 10 yang belum tercatat di ledger

- Tidak ada `loading.tsx` di bawah `src/app/(public)/events/`. File itu membungkus segmen `[slug]` dengan Suspense, dan `notFound()` / `permanentRedirect()` di dalam Suspense berubah jadi 404 "soft" berstatus 200. Resolusi slug (`load-event.ts`) harus tetap berjalan di luar Suspense. Skeleton `/events` memakai `<Suspense>` inline.
- Halaman `/events/[slug]` dan `/events/[slug]/tickets` mengekspor `ensureStatic = "navigation"`. Tanpa itu, slug yang tidak ada di `generateStaticParams` (slug lama, slug salah, event yang dipublikasikan setelah build) langsung dikirimi fallback shell berstatus 200, sehingga redirect dan 404 hanya terjadi di sisi klien. Dengan `'navigation'`, request pertama menunggu render lengkap. Akibatnya semua data di dua halaman itu wajib di-cache (`use cache` dengan `stale` ≥ 30 detik dan `expire` ≥ 5 menit).
- Cukup satu `error.tsx` di `(public)` dan satu `not-found.tsx` global di `src/app`.
- `MediaImage` tidak dibuat. `next/image` langsung memakai `images.loaderFile` global (`src/lib/image-loader.ts`) yang memilih varian WebP thumb/md/lg.
- Badge tiket di halaman detail dihitung di dalam `getPublicEvent` (scope `'use cache'`), karena `new Date()` di luar cache gagal saat prerender. Halaman tiket memperbarui badge dari `/api/events/{slug}/availability`.
- Stepper memakai `aria-disabled` agar fokus keyboard tidak hilang di batas jumlah. Setelah "Pilih", stepper tetap tampil walau jumlahnya 0.
- Daftar media sosial dipindah ke `src/lib/social-links.ts` dan dipakai oleh form admin serta halaman publik.
- `toPlainText()` di `src/lib/rich-text.ts` dipakai untuk meta description dan JSON-LD.
- Beranda punya kotak cari (GET ke `/events`). Sitemap juga memuat `/terms` dan `/privacy`.

## Lingkungan dan jebakan yang sudah ditemui

- `.env.local` tidak ada di repo dan harus disalin pemilik secara aman. Variabel yang dibutuhkan ada di `.env.example`. Turnstile memakai kunci uji Cloudflare.
- Database adalah Supabase dev bersama dan dipakai juga oleh test DB. `DATABASE_URL` memakai pooler `aws-0-ap-southeast-1:6543`, karena host direct hanya IPv6.
- Supavisor membuang query yang di-pipeline, sehingga `max_pipeline: 0` diperlukan. Transaksi memakai helper `transaction()` (berbasis `sql.reserve()`), bukan `sql.begin`.
- Test DB wajib lewat `npm run test:db` (`--no-file-parallelism`). Kalau dijalankan paralel, cleanup `test-admin-%` antar file saling bentrok di FK `audit_logs`.
- Di Windows, dev server Turbopack kadang memakai modul lama setelah file lib bersama diubah, misalnya muncul `... is not a function` atau hydration mismatch. Restart dev server. Hindari `sed -i` saat dev server jalan.
- Skrip `tsx` dengan top-level await harus berekstensi `.mts`.
- Setelah memindah halaman, error `tsc` dari `.next/types` hilang sendiri setelah `npm run build`.
- `npm run start` gagal kalau port 3000 masih dipakai dev server.
- Next.js 16.4 dengan `cacheComponents` dan `partialPrefetching`. Baca `node_modules/next/dist/docs/` sebelum menulis kode. Poin pentingnya:
  - `proxy.ts` menggantikan middleware.
  - Data runtime harus berada di dalam `<Suspense>`.
  - Invalidasi dari Route Handler memakai `revalidateTag(tag, { expire: 0 })`.
  - `generateStaticParams` minimal harus mengembalikan satu entri.
  - `priority` pada image sudah diganti `preload`.

## Data di database dev

- Event contoh: "Jazz di Taman 2026" (id 645, slug `jazz-taman-2026`, published, on sale). Isinya 3 kategori tiket (Reguler, VIP, Bundling Couple) dan 4 field form.
- `admin@admin.com` milik pemilik dan 2FA-nya aktif. Jangan diubah.
- Admin sementara `verify-temp@anytix.test` dipakai untuk uji browser. Kata sandinya tidak dicatat di repo: buat ulang dengan `npm run admin:create` bila perlu, lalu hapus di checkpoint.
- Pengaturan SMTP sudah tersimpan di tabel `settings` (password terenkripsi) dengan nilai sama seperti `.env.local`. Pengaturan transaksi dan situs ada di nilai default.

## Ledger Fase 1 (Task 1–9)

Salinan dari `.superpowers/sdd/2026-10-17-fase-1-katalog-admin/progress.md`. Folder itu di-gitignore. Isinya keputusan ("Ruling") yang menyimpang dari teks plan dan hasil cek browser per task.

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
