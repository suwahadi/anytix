# Serah terima pengerjaan Anytix

Terakhir diperbarui: 18 Oktober 2026, setelah revamp beranda publik. Dokumen ini untuk agent AI berikutnya. Baca seluruhnya sebelum menulis kode.

## Sumber kebenaran

- `PRD.md`: kebutuhan produk.
- `docs/superpowers/specs/2026-10-17-anytix-mvp-design.md`: keputusan desain yang disetujui pemilik, termasuk arah visual dan dial `ENERGY 1 / RHYTHM 2 / MOTION 1`.
- `docs/superpowers/plans/2026-10-17-fase-0-fondasi.md`, `…-fase-1-katalog-admin.md`, `…-fase-2-booking-inti.md`, `…-fase-3-hari-h.md`: empat fase yang sudah selesai. Kotak centang di file plan tidak diperbarui; status sebenarnya ada di dokumen ini.
- `anti-slop/audit-001-2026-10-17.md` (halaman publik), `audit-002-2026-10-17.md` (booking, pesanan), dan `audit-003-2026-10-18.md` (layar Hari-H): Delivery Gate bersih. Semua temuan LOW sudah diperbaiki atas permintaan pemilik (audit 002 nomor 1, audit 003 nomor 1–3).
- `docs/superpowers/specs/2026-10-18-homepage-revamp-design.md` dan `docs/superpowers/plans/2026-10-18-homepage-revamp.md`: revamp beranda ala artatix (8 task, selesai). `anti-slop/audit-004-2026-10-18.md`: 7 temuan menunggu keputusan pemilik.
- `docs/runbook.md`: panduan produksi aaPanel (PM2 port 3100, Nginx, Midtrans, email Brevo port 2525, backup).
- `AGENTS.md`: aturan proyek dan aturan pemilik.

Ruang lingkup yang disepakati adalah Fase 0–3, dan keempatnya sudah selesai. Fase 4 (go-live produksi) di luar putaran ini kecuali pemilik memintanya.

## Status

| Bagian | Status |
|---|---|
| Fase 0 (fondasi, engine anti-oversell, worker) | Selesai dan di-push |
| Fase 1 (katalog, admin, halaman publik) | Selesai dan di-push |
| Fase 2 (booking inti) | Selesai dan di-push |
| Fase 3 (Hari-H) | Selesai: 13 task, review menyeluruh (3 temuan Important diperbaiki dengan RED→GREEN, 7 Minor ditunda), audit antislop 003, lalu di-push |
| Fase 4 (go-live) | Live di https://anytix.web.id dengan Midtrans sandbox; pembayaran, webhook, PDF dan email teruji end-to-end. Sisa langkah pemilik di bawah |
| Revamp beranda | Selesai dan di-push: header pill, hero carousel, Rekomendasi, Laris Manis, Kategori, Event Terdekat, footer 4 kolom. Belum di-deploy ke server |
| Konten (Tentang Kami, Hubungi Kami, FAQ) | Selesai dan di-push: admin /admin/content (editor dengan unggah gambar, FAQ urut-geser), publik /about, /contact, /faq (accordion satu-terbuka). Migrasi 0014 (tabel `faqs`, setting `pages` berisi lorem ipsum) sudah diterapkan ke database bersama. Isi Tentang Kami dan Hubungi Kami masih lorem ipsum |

Hasil test terakhir: `npm test` (unit) 183 lulus, `lint`, `tsc` dan `build` bersih. Migrasi 0015 (index `jobs_running_idx`) dan 0016 (`admins.totp_last_step`, kode 2FA hanya berlaku sekali) sudah diterapkan ke database bersama.

## Langkah berikutnya

1. **Pemilik: deploy revamp beranda** di server dengan `bash deploy/deploy.sh`.
2. **Pemilik: pilih nomor temuan audit 004** yang mau diperbaiki. Hanya nomor yang disetujui yang dikerjakan.
3. **Sisa go-live (dijalankan pemilik):**
   - Midtrans produksi.
   - Autentikasi domain Brevo, serta mailbox `cs@` dan `admin@`.
   - Cron backup dan uji restore.
   - UptimeRobot.
   - Aktifkan 2FA untuk `admin@anytix.web.id`.
   - Saat cutover: hapus `DB_TESTS_ALLOWED` dan `DB_WRITE_ALLOWED` dari `.env.local` laptop, jalankan `npm run db:reset-dev -- --apply`, lalu `npm run preflight`.
   - Uji beban k6.
4. **Jebakan Next 16 di header publik:** `usePathname()` di komponen client wajib dibungkus `<Suspense>`, karena route dinamis seperti `/checkout/[holdId]` gagal di-prerender tanpanya. `NavPills` dan `MobileNav` sudah dibungkus, dengan fallback tanpa status aktif.

## Bawaan untuk Fase 4 dan catatan

Ketujuh temuan Minor dari review akhir Fase 3 sudah diperbaiki atas permintaan pemilik (18 Okt 2026, migrasi 0012):

- **Scan vs reissue:** scan yang berpacu dengan reissue token-nya kini "TIDAK VALID". Update pemenang di `check_in_ticket` juga mencocokkan token.
- **Sesi admin:** ganti kata sandi dan reset 2FA mengakhiri sesi lama lewat `admins.sessions_valid_after` (`revokeSessions`). Perangkat yang mengganti kata sandi mendapat cookie baru.
- **CSV:** WhatsApp ditulis bergrup, misalnya `62 8123 4567 890`, supaya Excel tidak mengubahnya jadi angka ilmiah.
- **Scanner:**
  - `barcode-detector` di-pin `3.2.2`. `tests/unit/zxing-wasm.test.ts` gagal bila `ZXING_WASM` tidak cocok dengan `zxing-wasm` yang terpasang.
  - Bila detector gagal dimuat, pesannya terpisah: "Pemindai QR gagal dimuat…".
- **PDF:** `fitLines` memotong kata panjang dan membatasi judul 3 baris dengan "…". Ukuran QR menyesuaikan ruang tersisa (120–170 pt).
- **Panel:** tombol konfirmasi "Terbitkan ulang QR" dan "Batalkan pesanan" bergaya `danger`.
- **Checkout:** bila quote ulang gagal saat promo dihapus, total kembali ke perhitungan tanpa diskon.

Sisa dari fase sebelumnya:

- Batas per IP (60/menit untuk `/api/holds` dan polling `/api/orders`) bisa terkena NAT operator seluler. Batas yang sama juga menahan k6 bila dijalankan dari satu mesin.
- Email atau alert admin bisa terkirim dua kali bila pencatatan gagal setelah pengiriman sukses (at-least-once).
- HSTS bergantung pada `APP_URL` saat build. Build produksi harus memakai `APP_URL` https.
- Rename slug kategori event tidak punya redirect, dan event di kategori tersembunyi tetap tampil. Tanyakan ke pemilik.
- Di `next dev`, setiap halaman 404 memuat ulang dirinya sendiri. Di `next start` tidak terjadi.

## Keputusan Fase 3 di luar teks plan

- **Token scan diterima sampai 2048 karakter.** QR non-tiket seperti QRIS harus berujung "TIDAK VALID" dan tercatat, bukan 422. `checkin_events.token` menyimpan 64 karakter pertama.
- **Kolom baru `checkin_events.event_id`** (migrasi 0010). Riwayat per event mencakup scan kode yang tidak dikenal. `cleanupTestEvents` menghapus berdasarkan `event_id`.
- **Batas scan 600/menit per akun admin.** Petugas gerbang memakai akun admin bersama di beberapa ponsel (PRD §4).
- **Scanner dan PWA:**
  - Debounce scanner ada di `src/lib/checkin/scan-gate.ts` (`ScanGate`, `openCamera`): kode yang sama diabaikan 2 detik setelah scanning dilanjutkan, bukan sejak request dikirim.
  - Native `BarcodeDetector` dipakai bila ada. Bila tidak, ponyfill `barcode-detector` dengan wasm dari `/vendor`; CSP menambah `'wasm-unsafe-eval'`, dan `Permissions-Policy: camera=(self)`.
  - Manifest PWA berupa route `/checkin.webmanifest` yang hanya ditautkan dari `/admin/check-in`, supaya memasang situs publik tidak membuka scanner admin. Service worker `public/sw.js` hanya install/claim (scope `/admin/`), tanpa cache.
  - Ikon PWA "A" putih di atas `#C2410C` disetujui pemilik.
- **Warna scan tetap di kedua tema:** `--color-scan-ok` `#047857`, `--color-scan-bad` `#b91c1c`. Jam scan ditulis `HH:mm` dengan titik dua sesuai copy PRD.
- **Identitas di scanner** tampil sebagai "KTP 3201********0001". Nomor yang dibuka di detail pesanan hanya ada di state komponen dan dihapus di cleanup effect.
- **`pageAdmin()`** (`src/lib/admin-page.ts`) wajib dipanggil di setiap server component yang menampilkan data admin. Proxy hanya memeriksa tanda tangan cookie, belum status aktif admin.
- **Voucher:**
  - Kode voucher error dari `compute_quote` dipetakan ke teks Indonesia di `src/lib/booking/voucher-errors.ts`.
  - `UserError` punya argumen ke-4 `code` (dipakai checkout: `{ code: "VOUCHER" }`).
  - Quote dengan kode promo dibatasi 10/menit per visitor.
- **Media dan PDF:**
  - `mediaPath` hanya menerima `poster|logo|icon/YYYY/<12 karakter>`.
  - Gambar yang diganti dihapus lewat `src/lib/media-cleanup.ts`.
  - PDF memakai Helvetica. Karakter di luar WinAnsi diganti huruf dasarnya atau `?` (`shortcut:` di `ticket-pdf.ts`).
- **Ekspor dan retensi:**
  - CSV: BOM, CRLF, pengaman formula di `src/lib/csv.ts`. Kolom jawaban form hanya muncul bila diekspor per event. Status memakai label panel, metode memakai label pembeli.
  - Retensi identitas: `purge_identity_numbers()` dijalankan pg_cron `30 19 * * *` UTC (02.30 WIB).
- **Panel admin:**
  - Navigasi admin tampil di satu baris mulai `lg`, dan email admin di bar baru tampil mulai `2xl` (di bawahnya ada di menu ponsel dan halaman Keamanan).
  - Test "admin aktif terakhir" tidak ditulis, karena database dev memuat admin pemilik yang tidak boleh dinonaktifkan. Guard berupa `UPDATE` bersyarat.

## k6

Skrip ada di `k6/`. Di mesin dev ini hanya dicek dengan `node --check`.

- `k6 run -e BASE_URL=https://… -e EVENT_ID=… -e INVENTORY_ID=… k6/hold-rush.js`: 300 VU, satu hold per VU. Hitung `holds_created` vs `holds_sold_out`.
- `k6 run -e BASE_URL=… -e SLUG=… k6/event-page.js`: 1.000 VU di halaman event.
- `k6 run -e BASE_URL=… -e EVENT_ID=… -e TOKENS_FILE=tokens.txt -e ADMIN_COOKIE="anytix_admin=…" k6/checkin.js`: satu token per baris.
- **Setelah run,** jalankan `select * from reconcile_inventory(false)` (harus kosong) dan pastikan `sold + held <= capacity`.
- **Dari satu mesin, batas permintaan menahan uji:** 60/menit per IP untuk `/api/holds`, dan 600/menit per admin untuk scan. Naikkan sementara di environment uji atau sebar IP sumber.

## Lingkungan dan jebakan

- **`.env.local` dan tunnel webhook:**
  - `.env.local` tidak ada di repo. Pastikan namanya `.env.local` (dengan titik).
  - `NEXT_PUBLIC_MEDIA_BASE_URL` = `SUPABASE_URL` + `/storage/v1/object/public/media`.
  - `MIDTRANS_NOTIFICATION_URL` kosong. Isi ulang setiap kali tunnel baru dibuat.
- **Uji webhook:**
  - Jalankan `ngrok http 3000` (authtoken sudah terpasang di mesin ini), lalu isi `MIDTRANS_NOTIFICATION_URL=https://<tunnel>/api/webhooks/midtrans`.
  - Restart `npm run start` dan jalankan `npm run worker`.
  - Simulator: `https://simulator.sandbox.midtrans.com`.
- **Midtrans sandbox:**
  - Akun Midtrans sandbox baru sejak 17 Okt 2026, dengan nama merchant di popup Snap "AnyTix". Ketujuh metode (`other_qris`, `bca_va`, `bni_va`, `bri_va`, `echannel`, `permata_va`, `cimb_va`) terbukti membuat transaksi.
  - Get Status sandbox kadang menjawab 404 untuk transaksi yang sudah lunas. Jangan menyimpulkan bug dari satu panggilan sandbox.
- **Brevo (akun baru):**
  - SMTP mengirim setelah IP mesin dev diizinkan (Security → Authorised IPs).
  - IP koneksi seluler bisa berganti. Bila muncul `525 5.7.1 Unauthorized IP address`, izinkan IP baru.
  - Cadangan baris `settings.smtp` lama ada di scratchpad sesi 17 Okt 2026, bukan di repo.
- **Jam Windows harus sinkron.** Selisih 30 detik membuat test DB gagal. Perbaikan di PowerShell Administrator: `Start-Service w32time; w32tm /resync /force`.
- **Worker** memproses semua job di antrean database bersama. Hentikan worker sebelum `npm run test:db`, dan periksa penerima job email dan `admin-alert` sebelum menjalankan worker sungguhan.
- **Test yang membuat baris `settings` baru** harus menghapusnya di `afterAll`.
- **`next dev` menulis ulang blok `<!-- BEGIN:nextjs-agent-rules -->` di `AGENTS.md`.** Aturan proyek harus berada di luar blok itu.
- **Database adalah Supabase dev bersama:**
  - `DATABASE_URL` memakai pooler `aws-0-ap-southeast-1:6543`, `max_pipeline: 0`, dan transaksi lewat `transaction()`.
  - Parameter postgres.js tidak bisa ditaruh setelah kata kunci `interval`. Pakai `make_interval(...)`.
- **Urutan FK untuk menghapus data order uji:** `checkin_events` (per `event_id` atau ticket) → `tickets` → `order_answers` → `consents` → `email_logs` → `payment_events` → `payments` → `jobs` (via `payload->>'order_id'`) → `orders` → `hold_items` → `holds` → `vouchers`, lalu `reconcile_inventory(true)`. Admin uji: hapus `audit_logs` dulu, baru `admins`.
- **Skrip yang mengimpor `@/…`** harus berada di dalam folder proyek (misalnya `scripts/_x.mts`, lalu hapus). Skrip dengan top-level await harus `.mts`.
- **Penulisan file di Windows:**
  - Python di Windows menulis CRLF bila file dibuka tanpa `newline=''`. Edit dengan `newline=''`, atau normalkan ke LF sebelum commit.
  - Di Windows, menghentikan `npm run start` dari task latar belakang bisa menyisakan proses `node`. Matikan proses di port 3000 sebelum build ulang.
- **Playwright:**
  - Pakai `waitUntil: 'load'` dan locator `:visible`.
  - Pesan konsol dari iframe Midtrans dan peringatan preload CSS Next bukan error aplikasi.
  - Kamera bisa ditiru dengan `addInitScript` yang mengganti `getUserMedia` dengan `canvas.captureStream()` berisi gambar QR. Chromium Windows tidak punya `BarcodeDetector` native, jadi jalur ponyfill yang teruji.
- **Next.js 16.4** dengan `cacheComponents` dan `partialPrefetching`. Baca `node_modules/next/dist/docs/` sebelum menulis kode.

## Data di database dev

- **Event contoh:** "Jazz di Taman 2026" (id 645, slug `jazz-taman-2026`, published, on sale) dengan 3 kategori tiket dan 4 field form. Tidak ada order, hold, voucher atau check-in; `sold` dan `held` = 0.
- **Admin:** hanya `admin@admin.com` (2FA aktif). Agent tidak boleh mengubahnya. Untuk uji browser, buat admin sementara dengan `ADMIN_PASSWORD=… npm run admin:create -- nama@anytix.test`, lalu hapus.
- **Pengaturan transaksi** bernilai default. Baris `email_templates` tidak ada. `settings.smtp` memakai akun Brevo baru.
