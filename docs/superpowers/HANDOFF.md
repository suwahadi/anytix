# Serah terima pengerjaan Anytix

Terakhir diperbarui: 18 Oktober 2026, di akhir Fase 3. Dokumen ini untuk agent AI berikutnya. Baca seluruhnya sebelum menulis kode.

## Sumber kebenaran

- `PRD.md`: kebutuhan produk.
- `docs/superpowers/specs/2026-10-17-anytix-mvp-design.md`: keputusan desain yang disetujui pemilik, termasuk arah visual dan dial `ENERGY 1 / RHYTHM 2 / MOTION 1`.
- `docs/superpowers/plans/2026-10-17-fase-0-fondasi.md`, `…-fase-1-katalog-admin.md`, `…-fase-2-booking-inti.md`, `…-fase-3-hari-h.md`: empat fase yang sudah selesai. Kotak centang di file plan tidak diperbarui; status sebenarnya ada di dokumen ini.
- `anti-slop/audit-001-2026-10-17.md` (halaman publik), `audit-002-2026-10-17.md` (booking, pesanan), dan `audit-003-2026-10-18.md` (layar Hari-H): Delivery Gate bersih. Temuan LOW yang menunggu keputusan pemilik: nomor 1 di audit 002, nomor 1–3 di audit 003.
- `AGENTS.md`: aturan proyek dan aturan pemilik.

Ruang lingkup yang disepakati adalah Fase 0–3, dan keempatnya sudah selesai. Fase 4 (go-live produksi) di luar putaran ini kecuali pemilik memintanya.

## Status

| Bagian | Status |
|---|---|
| Fase 0 (fondasi, engine anti-oversell, worker) | Selesai dan di-push |
| Fase 1 (katalog, admin, halaman publik) | Selesai dan di-push |
| Fase 2 (booking inti) | Selesai dan di-push |
| Fase 3 (Hari-H) | Selesai: 13 task, review menyeluruh (3 temuan Important diperbaiki dengan RED→GREEN, 7 Minor ditunda), audit antislop 003, lalu di-push |

Hasil test terakhir: `npm test` 143 lulus, `npm run test:db` 233 lulus, `lint`, `tsc` dan `build` bersih.

## Langkah berikutnya

1. **Pemilik: ganti email `admin@admin.com`.** Caranya lewat panel `/admin/admins` → Ganti email (atau tambah admin baru lalu nonaktifkan yang lama). Alert admin dikirim ke semua admin aktif, dan `admin.com` adalah domain milik pihak lain. Sampai diganti, worker jangan dijalankan di lingkungan yang menerima pembayaran sungguhan.
2. **Pemilik: perbaiki `SMTP_FROM` di `.env.local`.** Formatnya harus `AnyTix <alamat@gmail.com>`. Nilai di panel (`settings.smtp`) sudah benar dan dipakai lebih dulu.
3. **Pemilik: putuskan temuan LOW** di audit 002 (nomor 1) dan audit 003 (nomor 1–3).
4. **Uji di perangkat sungguhan (belum dilakukan).** Kamera di sesi agent selalu tiruan.
   - Buka `/admin/check-in` di ponsel lewat tunnel HTTPS (ngrok), pasang sebagai PWA, lalu scan QR dari halaman pesanan dan dari PDF cetak.
   - Uji juga QRIS sungguhan (harus "TIDAK VALID"), dan tahan satu tiket di depan kamera ≥ 3 detik (harus tetap hijau sekali, tanpa merah).
5. **Bila pemilik meminta Fase 4:**
   - Midtrans produksi.
   - Autentikasi domain email (DKIM, DMARC) dan paket Brevo berbayar.
   - Runbook dan uji restore.
   - Uji beban k6 di server dekat region Supabase (lihat "k6" di bawah).
   - Daftar "Bawaan untuk Fase 4".

## Bawaan untuk Fase 4

Dari review akhir Fase 3 (Minor, ditunda):

- `check_in_ticket`: update pemenang hanya mencocokkan `id`. Scan token lama yang sedang berjalan saat reissue bisa lolos. Perbaikan satu baris: `and token = p_token`.
- Ganti kata sandi dan reset 2FA tidak mencabut sesi yang sudah ada (cookie stateless, 12 jam). Perlu kolom `session_version` yang dicek di `adminFromCookie`.
- Kolom WhatsApp di CSV terbaca Excel sebagai angka ilmiah (`6.28E+12`).
- `public/vendor/zxing_reader-3.1.3.wasm` bisa tidak cocok dengan `zxing-wasm` yang terpasang setelah `npm update`. Tambah test versi, dan pesan error terpisah bila detector gagal dimuat (sekarang tampil "Kamera tidak tersedia").
- PDF: kata yang lebih lebar dari halaman tidak dipotong, dan judul ≥ 5 baris mendorong QR ke footer.
- Tombol konfirmasi "Terbitkan ulang QR" belum bergaya `danger`.
- `removePromo` di checkout: bila quote ulang gagal, total lama yang masih terdiskon tetap tampil, padahal order tetap ditagih dengan benar.

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
  - Navigasi admin tampil di satu baris mulai `lg`, dan email admin di bar baru tampil mulai `2xl`.
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
