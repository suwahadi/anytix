# Desain Implementasi MVP Anytix

Sumber utama perilaku produk adalah `PRD.md` di root repo. Dokumen ini hanya mencatat keputusan yang tidak ada di PRD: jawaban pemilik produk, pilihan teknis builder, klarifikasi atas bagian PRD yang bisa ditafsirkan ganda, dan urutan kerja. Bila dokumen ini dan PRD bertentangan, dokumen ini yang berlaku karena lebih baru.

## 1. Keputusan pemilik produk (17 Okt 2026)

| Topik | Keputusan |
|---|---|
| Cakupan | Fase 0–3 dari roadmap PRD §23. Berhenti di akhir tiap fase agar pemilik bisa mengecek sebelum lanjut. Fase 4 (go-live produksi) di luar putaran ini |
| Kredensial dev | Tersedia: project Supabase, Midtrans sandbox, SMTP. Belum ada: Cloudflare Turnstile, sehingga dipakai test key resmi Cloudflare (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`) sampai key asli tersedia |
| Antislop | Diterapkan selama pengerjaan (UI, teks antarmuka, komentar kode) |
| Tampilan | Tata letak dan alur meniru Artatix; palet netral dengan satu warna aksen; nama situs sementara "Anytix" (bisa diganti dari panel lewat `settings.site`) |
| Arah visual (17 Okt 2026) | Warna aksen merah bata `#C2410C`, dipakai hemat (tombol utama, harga, status penting); sisanya netral. Font Plus Jakarta Sans. Logo sementara: teks "Anytix" dengan font yang sama; logo asli bisa diunggah dari Pengaturan Situs. Dial: ENERGY 1 / RHYTHM 2 / MOTION 1 |
| Repo | `https://github.com/suwahadi/anytix.git`, branch `main`. Pesan commit dan deskripsi PR tidak boleh memuat co-author atau atribusi Anthropic/Claude |

## 2. Pilihan teknis (keputusan builder)

| Area | Pilihan | Alasan |
|---|---|---|
| Framework | Next.js versi stabil terbaru (App Router) + TypeScript, Tailwind CSS v4, npm | Sesuai PRD §5; npm sudah terpasang |
| Akses DB | `postgres` (postgres.js), SQL mentah tanpa ORM, `prepare: false`, `max_pipeline: 0` (Supavisor transaction mode kehilangan query yang di-pipeline di belakang query lain; terbukti di uji 17 Okt 2026), pool 10–20, satu `DATABASE_URL` ke transaction pooler 6543 | Sesuai PRD §5. Koneksi memakai role `postgres` milik Supabase, yang setara service role untuk akses DB |
| Migrasi | File SQL bernomor di `db/migrations/`, dijalankan skrip Node kecil (`npm run db:migrate`) yang mencatat file terpasang di tabel `schema_migrations`. Satu file = satu transaksi | Tidak butuh Supabase CLI/Docker (tidak tersedia di mesin dev) |
| Fungsi kuota | Semua di plpgsql sesuai PRD §10, `security definer`, `search_path = ''`, `execute` dicabut dari `public`, `anon`, `authenticated` | PRD §10.1 |
| Perhitungan harga | Satu fungsi plpgsql `quote_hold(hold_id, voucher_code)` dipakai oleh endpoint quote dan oleh `checkout_hold` | Satu sumber kebenaran untuk subtotal, diskon, biaya layanan, total |
| Validasi form | zod; skema dibangun dari `form_fields` dan dipakai bersama di klien dan server. Validasi data pemesan dan jawaban dilakukan di Node sebelum RPC `checkout_hold`; fungsi DB hanya menolak data struktural yang kosong | Server tetap sumber kebenaran (PRD §14) |
| Auth admin | Tabel `admins`, hash password `crypto.scrypt` bawaan Node, sesi berupa cookie HttpOnly bertanda tangan HMAC (berisi admin id + kedaluwarsa, `is_active` dicek tiap request), TOTP RFC 6238 ditulis sendiri dengan `crypto` (2FA opsional per admin) | Tanpa dependensi tambahan |
| Admin pertama | Dibuat lewat skrip CLI `npm run admin:create` | Tidak ada halaman pendaftaran publik |
| Cookie visitor | UUID v4 acak + tanda tangan HMAC, dipasang di middleware/proxy Next bila belum ada | PRD §4 |
| Enkripsi | AES-256-GCM di Node dengan kunci dari env (`DATA_ENCRYPTION_KEY`) untuk nomor identitas, password SMTP, dan secret TOTP | PRD §6, §14 |
| Rich text deskripsi event | Editor Tiptap (StarterKit) di panel, disimpan sebagai HTML yang disanitasi `sanitize-html` di server | Admin non-teknis tidak perlu menulis Markdown |
| Drag & drop | `@dnd-kit/sortable` untuk form builder dan urutan kategori tiket | Mendukung keyboard (aksesibilitas) |
| Komponen UI | Komponen sendiri yang kecil (tombol, input, tabel); modal memakai elemen `<dialog>` bawaan | Tanpa pustaka komponen |
| Gambar | `sharp` → WebP 3 ukuran (PRD §17), diunggah ke Supabase Storage lewat REST API dengan service role key; bucket publik `media` dibuat oleh migrasi | Tanpa supabase-js |
| PDF e-ticket | `pdf-lib` + `qrcode` | Murni JS, tidak bermasalah dengan bundler Next |
| Scanner | `BarcodeDetector` native; fallback ponyfill `barcode-detector` (zxing-wasm) yang dimuat hanya bila native tidak ada. Manifest PWA + service worker minimal | PRD §15 |
| Midtrans | `midtrans-client`. URL notifikasi dikirim per transaksi lewat header `X-Override-Notification` dari env `MIDTRANS_NOTIFICATION_URL`, sehingga dev bisa memakai tunnel ngrok (sudah ada di Laragon) | Webhook butuh HTTPS publik |
| Daftar bank VA | Daftar tetap di kode (BCA, BNI, BRI, Mandiri `echannel`, Permata, CIMB). Kode yang gagal saat diuji di sandbox dihapus dari daftar. Admin hanya menyalakan/mematikan dari daftar ini. **Terverifikasi 17 Okt 2026:** `other_qris`, `bca_va`, `bni_va`, `bri_va`, `echannel` (Mandiri, menampilkan kode perusahaan + nomor VA), `permata_va`, `cimb_va` semuanya aktif di akun sandbox. Key sandbox akun ini berformat `Mid-server-…` tanpa awalan `SB-` | Midtrans tidak menyediakan API untuk mengetahui bank yang aktif di akun |
| Email | nodemailer; templat email: subjek dan paragraf isi bisa diedit di panel dengan placeholder `{{...}}`, tata letak HTML tetap di kode | PRD §16 menyebut "templat email" tanpa rincian |
| Job queue & worker | Tabel `jobs` + proses `worker/` yang dijalankan dengan `tsx`, memakai ulang kode `src/lib` | PRD §5 |
| Tes | vitest. Tes unit untuk logika murni; tes integrasi DB (termasuk uji konkurensi ratusan `reserve_tickets` paralel) berjalan ke project Supabase dev dan membersihkan datanya sendiri. Alur UI diverifikasi end-to-end dengan Playwright di browser | — |
| Load test | Skrip k6 disertakan sesuai PRD §21. Di mesin dev ini k6 tidak terpasang, jadi pembuktian anti-oversell memakai uji konkurensi Node di atas | — |

## 3. Klarifikasi dan deviasi dari PRD

1. **Token QR disimpan, bukan hanya hash-nya.** PRD §19 menyebut `tickets.token_hash`. Namun QR harus bisa ditampilkan ulang kapan saja di `/orders/{uuid}` dan PDF, sedangkan hash tidak bisa dibalik. Kolom menjadi `tickets.token` (acak 128-bit base64url, `unique`), dicari langsung saat scan. Konsekuensinya: orang yang bisa membaca DB bisa membuat QR valid. Risiko ini diterima karena orang yang bisa membaca DB sudah punya akses penuh. Admin tetap bisa menerbitkan ulang token.
2. **Urutan pelepasan slot untuk order yang tidak dibayar.** Sweeper (dan lazy reclaim) melepas slot hold `pending_payment` saat `expires_at` (= batas bayar + grace) lewat, lalu mengantrekan job `payment-check`. Worker kemudian memanggil Get Status: bila `settlement`, order diproses lewat jalur pembayaran terlambat; bila masih `pending`, dipanggil `expire` lalu order menjadi `expired`. Ini aman karena expiry Midtrans (= `pay_minutes`) selalu lebih awal dari `expires_at` hold.
3. **Tampilan status saat batas bayar lewat.** Setelah `pay_expires_at` lewat, halaman pesanan langsung menampilkan KEDALUWARSA walau status DB masih `awaiting_payment` dan sedang difinalisasi worker. Bila ternyata ada settlement terlambat, halaman berubah menjadi LUNAS.
4. **Voucher bercakupan kategori.** Bila voucher dibatasi ke kategori tertentu, dasar diskon, `min_qty`, dan `min_subtotal` dihitung dari item kategori yang cocok saja. Diskon dibatasi agar total tiket setelah diskon minimal Rp1.000 (PRD §13). `max_uses` kosong berarti tanpa batas.
5. **`policy_version` pada consent** adalah waktu terakhir teks Kebijakan Privasi diubah di panel.
6. **CSP** memakai `script-src 'self' 'unsafe-inline'` ditambah domain Midtrans dan Turnstile, karena skrip inline Next.js tanpa nonce. `shortcut: inline script diizinkan; ganti ke CSP berbasis nonce bila audit keamanan memintanya.`
7. **Voucher di Fase 2.** Logika voucher sudah masuk ke `quote_hold`/`checkout_hold` sejak Fase 2 karena fungsinya ditulis sekali. CRUD voucher di panel, generator massal, dan modal promo di UI baru dikerjakan di Fase 3.

## 4. Fase dan checkpoint

Setiap fase diakhiri dengan berhenti, ringkasan apa yang bisa dicoba pemilik, dan menunggu lanjut.

| Fase | Isi | Bukti selesai yang ditunjukkan |
|---|---|---|
| 0. Fondasi | Repo Next.js + worker, `git init`, `.env.example`, migrasi seluruh skema PRD §19 + RLS + fungsi plpgsql inti (§10) + pg_cron sweeper, tabel `settings` dengan default §6, auth admin (login, logout, 2FA), pipeline upload WebP | `npm run db:migrate` sukses ke Supabase; uji konkurensi: 300 panggilan paralel ke kategori berkuota 100 menghasilkan tepat 100 terjual/di-hold dan drift 0; login admin berjalan |
| 1. Katalog & admin | CRUD kategori event, event (slug + riwayat redirect, poster, rich text, fasilitas, refund policy, SEO), kategori tiket + kuota, form builder + pratinjau, pengaturan transaksi/situs/SMTP + email uji; halaman publik `/`, `/events`, `/events/{slug}`, `/events/{slug}/tickets` (tampilan saja); dark mode | Admin bisa menerbitkan event lengkap dan melihatnya di halaman publik |
| 2. Booking inti | `POST/GET/DELETE /api/holds`, quote, checkout + Snap, halaman `/checkout/{holdId}` (langkah 2–3 + semua kasus gagal PRD §8), `/orders/{uuid}` + polling, webhook, worker (email, payment-check, rekonsiliasi), sweeper aktif, email transaksional | Alur end-to-end di sandbox Midtrans: pilih tiket → bayar lewat simulator → LUNAS; skenario hold habis, webhook duplikat/terlambat lolos |
| 3. Hari-H | E-ticket QR + PDF, scanner PWA + riwayat + statistik, voucher (CRUD, generator massal, modal promo), popup refund, ekspor CSV, kontrol PDP (penyamaran, buka penuh + audit log, retensi 60 hari), dasbor penjualan, audit log, kelola admin, skrip k6 | Scan tiket hijau/merah berjalan; voucher memotong harga dan kuotanya terjaga; ekspor tanpa nomor identitas penuh |

8. **Keputusan kecil lain (keputusan builder):**
   - Alert admin (drift rekonsiliasi, `late_paid_review`) dikirim lewat email ke semua admin aktif dan tampil sebagai banner di dasbor.
   - Diskon persen dibulatkan ke bawah ke rupiah penuh.
   - `events.sale_status` adalah sumber kebenaran. Saat admin mengubahnya, `event_sessions.status` bawaan ikut diperbarui dalam transaksi yang sama.
   - Admin membatalkan order belum bayar: panggil `cancel` di Midtrans dulu (bila transaksi Snap sudah dibuat), lalu order menjadi `cancelled` dan slot serta voucher dilepas.
   - Pemulihan 2FA: admin lain bisa mereset 2FA sebuah akun dari panel; tersedia juga skrip CLI `npm run admin:reset-2fa`.
   - Tunnel dev untuk webhook dan kamera HTTPS: ngrok bila authtoken tersedia, kalau tidak Cloudflare quick tunnel (`cloudflared`, tanpa akun).

## 5. Asumsi

- Project Supabase yang diberikan khusus untuk dev dan masih kosong. Migrasi menulis ke schema `public`, sedangkan bucket storage dan pg_cron diaktifkan oleh migrasi. Sebelum migrasi pertama, builder mendaftar tabel yang sudah ada dan berhenti bila project ternyata tidak kosong. Bila role `postgres` tidak bisa membuat bucket lewat SQL, bucket dibuat lewat Storage REST API.
- Target kecepatan PRD (p95 kunci slot < 150 ms, load test k6) tidak diukur di mesin dev ini. Yang dibuktikan hanya kebenaran di bawah konkurensi. Pengukuran kinerja dilakukan di Fase 4 pada server yang dekat dengan region Supabase.
- Aplikasi berjalan sebagai satu instance (rate limiter in-memory, PRD §5).
- Asumsi A1–A3 PRD §22 berlaku apa adanya.
- Kredensial disimpan pemilik di `.env.local`, yang tidak pernah di-commit.

## 6. Diserahkan ke builder

Struktur folder, nama komponen dan file (mengikuti konvensi penamaan PRD §5), detail visual dalam batas "netral + satu aksen", teks mikro antarmuka berbahasa Indonesia, dan urutan tugas di dalam tiap fase.
