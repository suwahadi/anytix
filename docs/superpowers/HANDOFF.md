# Serah terima pengerjaan Anytix

Terakhir diperbarui: 17 Oktober 2026, di akhir Fase 2. Dokumen ini untuk agent AI berikutnya. Baca seluruhnya sebelum menulis kode.

## Sumber kebenaran

- `PRD.md`: kebutuhan produk.
- `docs/superpowers/specs/2026-10-17-anytix-mvp-design.md`: keputusan desain yang disetujui pemilik, termasuk arah visual dan dial `ENERGY 1 / RHYTHM 2 / MOTION 1`.
- `docs/superpowers/plans/2026-10-17-fase-0-fondasi.md`, `…-fase-1-katalog-admin.md`, `…-fase-2-booking-inti.md`: tiga fase yang sudah selesai. Kotak centang di file plan tidak diperbarui; status sebenarnya ada di dokumen ini.
- `anti-slop/audit-001-2026-10-17.md` (halaman publik) dan `anti-slop/audit-002-2026-10-17.md` (booking, pesanan, Pesanan admin): Delivery Gate bersih. Temuan LOW nomor 1 di audit 002 menunggu keputusan pemilik.
- `AGENTS.md`: aturan proyek dan aturan pemilik.

Ruang lingkup yang disepakati adalah Fase 0–3. Pengerjaan berhenti di akhir tiap fase.

## Status

| Bagian | Status |
|---|---|
| Fase 0 (fondasi, engine anti-oversell, worker) | Selesai dan di-push |
| Fase 1 (katalog, admin, halaman publik) | Selesai dan di-push |
| Fase 2 (booking inti) | Selesai: 12 task, uji sandbox Midtrans end-to-end, review menyeluruh (4 temuan Important diperbaiki), audit antislop 002, lalu di-push |
| Fase 3 | Belum ada plan |

Hasil test terakhir: `npm test` 124 lulus, `npm run test:db` 182 lulus, `lint`, `tsc` dan `build` bersih.

## Langkah berikutnya

1. Pemilik: izinkan IP mesin dev di Brevo (Security → Authorised IPs). Saat ini SMTP menolak dengan `525 5.7.1 Unauthorized IP address`, jadi email sungguhan belum pernah terbukti sampai ke kotak masuk. Setelah itu, kirim satu email transaksional uji dan catat hasilnya.
2. Pemilik: ganti email admin `admin@admin.com` ke alamat asli. Alert admin (pembayaran terlambat, selisih kuota) dikirim ke semua admin aktif, dan `admin.com` adalah domain milik pihak lain. Sampai diganti, jangan jalankan worker di lingkungan yang menerima pembayaran sungguhan.
3. Buat plan Fase 3 dari PRD (§13, §14 PDP, §15, §16, §21 k6) dan spec §4 baris "3. Hari-H": e-ticket QR + PDF, scanner PWA + riwayat + statistik, voucher (CRUD, generator massal, modal promo "Lebih hemat pakai promo"), ekspor CSV, kontrol PDP (buka penuh + audit log, retensi 60 hari), dasbor penjualan, audit log, kelola admin, skrip k6. Masukkan "Bawaan untuk Fase 3" di bawah. Jalankan task per task dengan TDD.
4. Di akhir fase: checkpoint seperti Task 12 Fase 2, lalu commit dan push ke `main`.

## Bawaan untuk Fase 3

Dari review akhir Fase 2 (Minor, ditunda):

- Dua request "Beli Sekarang" yang benar-benar bersamaan bisa lolos dari pengecekan replay selagi Turnstile diperiksa, sehingga yang kedua mendapat 403. Pengaman di UI mencegahnya, dan engine mengganti hold sebelumnya. Perbaikan: `Map<visitor:key, Promise>` untuk request yang sedang berjalan (satu instance). Celah yang sama ada di checkout.
- `ticket-picker.tsx` menghapus `Idempotency-Key` pada setiap kegagalan, termasuk timeout. Pertahankan key-nya bila `status === 0`.
- Body templat email dimasukkan sebagai HTML mentah (`render-order-email.ts`). Admin yang mengetik `<` atau `&` merusak email. Perbaikan: `fillPlaceholders(escapeHtml(template.body), vars, true)`.
- `normalizePhone`: "+62 0812…" dengan pilihan +62 tetap menyimpan angka 0 setelah kode negara. Buang satu angka 0 di depan setelah kode negara dilepas.
- `apply_payment_status` (Fase 0) menulis `payments.status` walau order tidak berubah, jadi detail admin bisa menampilkan pembayaran "Kedaluwarsa" pada order yang lunas. Jangan pernah menurunkan status `settlement`.
- Batas per IP (60/menit untuk polling `/api/orders` dan untuk `/api/holds`) bisa terkena NAT operator seluler. Tinjau ulang sebelum peluncuran.
- Email atau alert admin bisa terkirim dua kali bila pencatatan gagal setelah pengiriman sukses.
- `verifyTurnstile` tidak memeriksa `hostname` di respons siteverify.
- HSTS bergantung pada `APP_URL` saat build. Pastikan build produksi memakai `APP_URL` https.

Sisa bawaan dari Fase 1, belum dikerjakan:

- `smtp/test/route.ts`: `site.name` masuk ke HTML email tanpa di-escape.
- `mediaPath` di `validation/catalog.ts` menerima string apa saja. Validasi dengan format hasil upload.
- FK violation masih menjadi 500: `eventCategoryId` yang tidak ada, dan reserve yang masuk di antara cek `everReserved` dan delete di `removeTicketCategory`.
- `src/app/layout.tsx` memakai template judul tetap `%s · Anytix`, bukan nama situs dari pengaturan.
- Rename slug kategori tidak punya redirect, dan event di kategori tersembunyi tetap tampil. Tanyakan ke pemilik bila relevan.
- Gambar yang diganti atau dihapus tetap tersimpan di Supabase Storage.
- Di `next dev`, setiap halaman 404 memuat ulang dirinya sendiri. Di `next start` tidak terjadi.

## Keputusan Fase 2 di luar teks plan

- Midtrans dipanggil dengan `fetch` biasa (`src/lib/payments/midtrans.ts`), bukan `midtrans-client`. Setiap fungsi menerima `MidtransConfig` opsional supaya bisa diuji.
- Core API Midtrans menjawab HTTP 200 dengan hasil sebenarnya di `body.status_code` (terbukti di sandbox: transaksi yang tidak ada dijawab 200 + `status_code: "404"`). Kode ≥ 400 dianggap gagal, kecuali 404 (tidak ada) dan 407 (jawaban normal untuk transaksi kedaluwarsa).
- `serverNow` di setiap respons hold dan order diambil dari jam database (`now()`), bukan jam Node, karena `expires_at` dihitung oleh Postgres.
- Webhook selalu menjawab 200 setelah signature lolos. Kalau sinkronisasi gagal, job `payment-check:<order>:webhook:<ms>` diantrekan 30 detik kemudian.
- `payment-check` hanya meng-expire order secara lokal setelah lewat `pay_expires_at`, juga ketika Midtrans tidak mengenal transaksinya.
- Halaman pesanan tetap polling selama status di database masih `awaiting_payment`, termasuk setelah batas bayar. Selama masa itu tampil "Kami sedang memastikan status pembayaran Anda", dan "Pesan lagi" baru muncul setelah status final.
- Next 16 menyimpan state halaman yang ditinggalkan (Activity). State yang sedang berjalan (`buying`, `paying`, token Turnstile, `Idempotency-Key`) direset di cleanup effect. Semua `id` elemen di `CheckoutFlow` diberi awalan `useId()`, karena instance lama tetap ada di DOM.
- Kode email dipisah: `templates.ts` dan `render-order-email.ts` bersifat murni (dipakai pratinjau di panel), sedangkan `order-emails.ts` membaca database. Templat dibaca lewat `getSettingsGroup("email_templates")`, digabung dengan teks bawaan.
- `displayStatus`, `shouldPoll` dan `isFinalizing` ada di `src/lib/booking/order-status.ts` (murni).
- `Referrer-Policy: no-referrer` untuk `/orders/*` dan `/api/orders/*` dipasang lewat aturan header kedua di `next.config.ts`, karena aturan global menimpa header dari route. Aturan yang belakangan menang untuk key yang sama.
- Teks catatan QR di halaman pesanan yang LUNAS ("QR e-ticket tampil di sini sebelum hari acara.") disetujui pemilik.
- Modul Pesanan admin dikerjakan di Fase 2 atas pilihan pemilik.

## Lingkungan dan jebakan

- `.env.local` tidak ada di repo. Pastikan namanya `.env.local` (dengan titik). `NEXT_PUBLIC_MEDIA_BASE_URL` = `SUPABASE_URL` + `/storage/v1/object/public/media`. `MIDTRANS_NOTIFICATION_URL` dikosongkan setelah uji; isi ulang setiap kali tunnel baru dibuat.
- Uji webhook: `ngrok http 3000` (authtoken sudah terpasang di mesin ini), lalu isi `MIDTRANS_NOTIFICATION_URL=https://<tunnel>/api/webhooks/midtrans`, restart `npm run start`, dan jalankan `npm run worker`. Simulator: `https://simulator.sandbox.midtrans.com` (BCA VA di `/bca/va/index`, Mandiri Bill lewat menu "Mandiri Bill" → `/openapi/va/index?bank=mandiri`, isi biller code dan bill key).
- Get Status sandbox kadang menjawab 404 untuk transaksi yang beberapa menit sebelumnya sudah lunas. Jangan menyimpulkan bug dari satu panggilan sandbox.
- Nama merchant di popup Snap ("PJHonda") berasal dari akun Midtrans pemilik.
- Jam Windows harus sinkron (selisih 30 detik membuat 3 test DB gagal). Cek: `curl -sI https://www.google.com | grep -i date` lalu `date -u`. Perbaikan di PowerShell Administrator: `Start-Service w32time; w32tm /resync /force`.
- Worker memproses semua job di antrean database bersama. Hentikan worker sebelum `npm run test:db`. Periksa penerima job email dan `admin-alert` sebelum menjalankan worker sungguhan.
- Test yang membuat baris `settings` baru harus menghapusnya di `afterAll` (`settings.test.ts` sudah melakukannya).
- `next dev` menulis ulang isi blok `<!-- BEGIN:nextjs-agent-rules -->` di `AGENTS.md`. Aturan proyek harus berada di luar blok itu.
- Database adalah Supabase dev bersama. `DATABASE_URL` memakai pooler `aws-0-ap-southeast-1:6543`, `max_pipeline: 0`, transaksi lewat `transaction()`; untuk SQL ad hoc, `npx tsx --env-file=.env.local scripts/apply-sql.ts <file.sql>`. Parameter postgres.js tidak bisa ditaruh setelah kata kunci `interval`; pakai `make_interval(...)`.
- Hapus data order uji dengan urutan FK: `checkin_events` → `tickets` → `order_answers` → `consents` → `email_logs` → `payment_events` (via `midtrans_order_id`) → `payments` → `jobs` (via `payload->>'order_id'`) → `orders` → `hold_items` → `holds`, lalu `reconcile_inventory(true)`. Admin uji: `audit_logs` dulu, baru `admins`.
- Skrip yang mengimpor `@/…` harus berada di dalam folder proyek (misalnya `scripts/_x.mts`, lalu hapus). Skrip dengan top-level await harus `.mts`.
- Di Windows, menghentikan `npm run start`/worker dari task latar belakang bisa menyisakan proses `node`. Cek port dan matikan prosesnya sebelum build ulang.
- Error `tsc` "does not satisfy the constraint 'AppRoutes'" untuk route baru hilang setelah `npm run build`.
- Playwright: prefetch RSC tampak menggantung (`ERR_ABORTED` setelah 200), jadi pakai `waitUntil: 'load'`. Next menyimpan halaman sebelumnya tersembunyi di DOM, jadi gunakan locator `:visible`. Pesan konsol dari dalam iframe Midtrans (CSP milik Midtrans, `postMessage` origin) bukan error aplikasi.
- Next.js 16.4 dengan `cacheComponents` dan `partialPrefetching`. Baca `node_modules/next/dist/docs/` sebelum menulis kode.

## Data di database dev

- Event contoh: "Jazz di Taman 2026" (id 645, slug `jazz-taman-2026`, published, on sale) dengan 3 kategori tiket dan 4 field form. Tidak ada order dan hold; `sold` dan `held` = 0.
- Admin hanya `admin@admin.com` (2FA aktif). Jangan diubah oleh agent; pemilik akan menggantinya. Untuk uji browser, buat admin sementara dengan `ADMIN_PASSWORD=… npm run admin:create -- nama@anytix.test`, lalu hapus.
- Pengaturan transaksi bernilai default. Baris `email_templates` tidak ada, sehingga yang dipakai adalah teks bawaan.
