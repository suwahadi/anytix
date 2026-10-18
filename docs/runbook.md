# Runbook operasional Anytix

Panduan untuk pemilik dan pengelola. Setiap langkah ditulis dengan menu, nilai, dan cara memastikan langkah itu berhasil. Perintah `npm run …` dijalankan di folder aplikasi di VPS, kecuali disebut lain.

## Midtrans produksi

Dikerjakan sekali sebelum event pertama dijual.

1. **Aktifkan akun produksi.** Di dashboard Midtrans (`dashboard.midtrans.com`), pindah ke mode **Production**. Bila belum aktif, selesaikan verifikasi bisnis yang diminta Midtrans.
   - Berhasil bila: dashboard mode Production bisa dibuka dan menampilkan Merchant ID.
2. **Salin key produksi.** Buka Settings → Access Keys (mode Production). Isi `.env.local` di VPS:
   - `MIDTRANS_SERVER_KEY=` dengan Server Key produksi.
   - `MIDTRANS_CLIENT_KEY=` dengan Client Key produksi.
   - `MIDTRANS_IS_PRODUCTION=true`.
   - Biarkan `MIDTRANS_NOTIFICATION_URL` kosong.

   Lalu jalankan `bash deploy/deploy.sh`. Client key ikut terbaca saat build.
   - Berhasil bila: `npm run preflight` baris **Midtrans** menjadi PASS.
3. **Atur URL notifikasi.** Buka Settings → Configuration. Di dashboard versi baru menunya Settings → Payment → Notification URL.
   - Payment Notification URL: `https://anytix.web.id/api/webhooks/midtrans`.
   - Finish, Unfinish, dan Error Redirect URL: `https://anytix.web.id/`.

   Simpan.
   - Berhasil bila: tombol "Test notification URL" (bila tersedia) menjawab 200. Endpoint menjawab 401 untuk notifikasi uji yang tidak bertanda tangan sah. Itu juga tanda URL-nya terjangkau.
4. **Cek metode bayar yang aktif.** Jalankan `npm run midtrans:check`. Skrip ini membuat satu transaksi Rp10.000 per metode. Transaksi itu kedaluwarsa sendiri dalam 5 menit tanpa ditagih.
   - Berhasil bila: baris pertama tertulis `Midtrans PRODUKSI` dan setiap metode yang ingin dipakai tertulis `OK`.
   - Untuk setiap metode yang `ERROR`, aktifkan dulu di dashboard Midtrans (Settings → Snap Preferences / Payment Channels) lalu ulangi. Bila tidak dipakai, matikan di Panel → Pengaturan → Transaksi.
5. **Transaksi sungguhan pertama.** Beli satu tiket sungguhan dengan QRIS. Pastikan halaman pesanan menjadi LUNAS dan email "Pembayaran berhasil" masuk. Lalu refund lewat dashboard Midtrans (Transactions → pilih transaksi → Refund), bila metodenya mendukung.
   - Berhasil bila: di Panel → Pesanan, pesanan itu berstatus Lunas dan riwayat pembayarannya berisi `settlement`.

Catatan:
- Transaksi `ANYTIX-CHECK-…` di dashboard berasal dari langkah 4 dan boleh diabaikan.
- Key sandbox dan produksi tidak boleh tercampur. Bila `MIDTRANS_IS_PRODUCTION=true` tapi key masih sandbox, `midtrans:check` menampilkan `ERROR … HTTP 401`.

## Email dari domain anytix.web.id

Email transaksional (menunggu pembayaran, e-ticket, kedaluwarsa, pembayaran terlambat) dikirim worker lewat SMTP Brevo. Agar tidak masuk spam, domain pengirim harus terautentikasi.

1. **Tambahkan domain di Brevo.** Buka Brevo → Settings (ikon gerigi) → Senders, Domains & Dedicated IPs → tab **Domains** → Add a domain, lalu isi `anytix.web.id`. Brevo menampilkan beberapa record DNS: kode verifikasi Brevo (TXT), DKIM (CNAME atau TXT, misalnya `brevo1._domainkey` dan `brevo2._domainkey`), dan DMARC.
2. **Pasang record di DNS.** Buka pengelola DNS `anytix.web.id` (Cloudflare bila domain sudah dipindah ke sana, atau panel registrar). Salin setiap record persis seperti yang ditampilkan Brevo.
   - Untuk record CNAME di Cloudflare, matikan proxy (awan abu-abu, **DNS only**).
   - DMARC bila Brevo tidak memberikannya: TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:dmarc@anytix.web.id`. Ganti alamat `rua` dengan kotak masuk yang Anda baca.
   - Berhasil bila: di Brevo → Domains, `anytix.web.id` berstatus **Authenticated**. Propagasi bisa butuh beberapa menit sampai beberapa jam.
3. **Tambahkan alamat pengirim.** Buka tab **Senders** → Add a sender: nama `AnyTix`, email `noreply@anytix.web.id`.
   - Berhasil bila: sender tampil aktif. Domain yang sudah terautentikasi tidak perlu verifikasi kotak masuk.
4. **Izinkan IP VPS.** Buka Brevo → Security → **Authorised IPs** dan tambahkan IP publik VPS. Cek IP-nya dengan `curl -4 ifconfig.me` di VPS.
   - Bila langkah ini terlewat, pengiriman gagal dengan `525 5.7.1 Unauthorized IP address`. Penyebab ini juga yang paling umum bila email tiba-tiba berhenti.
5. **Pilih paket berbayar.** Paket gratis hanya 300 email/hari. Hitung kebutuhannya kira-kira 3 × jumlah pesanan per hari saat on-sale, lalu pilih paket di Brevo → Plans.
6. **Atur di panel.** Buka Panel → Pengaturan → Email:
   - Host `smtp-relay.brevo.com`, port `587`.
   - User dan password SMTP dari Brevo → SMTP & API → SMTP.
   - Pengirim `AnyTix <noreply@anytix.web.id>`.

   Simpan, lalu tekan **Kirim email uji** ke alamat Anda sendiri.
   - Berhasil bila: email uji masuk ke Inbox (bukan Spam), dan `npm run preflight` baris **SMTP** menjadi PASS.
7. **Cek skor pengiriman.** Buka `mail-tester.com`, salin alamat yang ditampilkan, kirim email uji dari panel ke alamat itu, lalu klik "Then check your score".
   - Berhasil bila: skor ≥ 9/10. Bila lebih rendah, bagian DKIM dan DMARC di laporan itu menunjukkan record yang kurang.

Kabari agent setelah langkah 2 selesai. Agent akan memastikan record DKIM dan DMARC terbaca dari internet.

## Backup dan restore

Database adalah satu-satunya tempat data pesanan dan tiket disimpan. Backup harian disimpan di VPS selama 14 hari. Salinannya juga dipindah ke luar VPS secara berkala.

### Menyiapkan backup harian

1. **Pasang klien PostgreSQL di VPS.** Versinya harus sama atau lebih baru dari server Supabase. Cek versi server di Supabase → Settings → Infrastructure, misalnya Postgres 17. Lalu, untuk Ubuntu/Debian:
   ```bash
   sudo apt install -y postgresql-common && sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
   sudo apt install -y postgresql-client-17
   pg_dump --version
   ```
   - Berhasil bila: `pg_dump --version` menampilkan versi yang sama dengan server.
2. **Isi `DATABASE_URL_DIRECT` di `.env.local`.** Ambil dari Supabase → Connect → **Session pooler** (port 5432, bukan 6543). `pg_dump` tidak bisa memakai transaction pooler.
3. **Uji sekali secara manual.** Jalankan `bash deploy/backup-db.sh`.
   - Berhasil bila: tampil `Backup selesai: /www/backup/anytix/anytix-YYYYMMDD-HHMM.dump (… MB)`.
4. **Jadwalkan di aaPanel.** Buka Cron → Add Task:
   - Type: **Shell Script**.
   - Name: `Backup database Anytix`.
   - Period: Daily, pukul 03:00.
   - Script: `bash /www/wwwroot/anytix/deploy/backup-db.sh`. Sesuaikan path dengan folder aplikasi.

   Berhasil bila: log cron hari berikutnya berisi `Backup selesai`.
5. **Salin ke luar VPS.** Backup di VPS ikut hilang bila VPS rusak. Pilih salah satu:
   - aaPanel → Cron dengan tipe **Backup directory** untuk `/www/backup/anytix` ke remote storage (Google Drive, S3, FTP) bila sudah dihubungkan.
   - Unduh file `.dump` terbaru seminggu sekali lewat aaPanel → Files.
6. **Cek paket Supabase.** Paket Pro menyimpan backup harian sendiri (Supabase → Database → Backups). Paket gratis tidak, sehingga backup dari VPS adalah satu-satunya cadangan.

### Uji restore (minimal sekali sebelum go-live, lalu tiap 3 bulan)

Restore tidak boleh diarahkan ke database produksi.

1. **Siapkan database kosong untuk uji.** Pilih salah satu:
   - Project Supabase baru (gratis) bernama `anytix-restore-test`, dengan versi Postgres yang sama.
   - PostgreSQL lokal dengan versi yang sama.
2. **Restore dump terbaru.**
   ```bash
   pg_restore --no-owner --no-privileges --dbname="<URL database uji>" /www/backup/anytix/anytix-<tanggal>.dump
   ```
   Peringatan tentang extension atau role yang tidak ada boleh diabaikan.
3. **Bandingkan jumlah baris** di database uji dan di produksi, dengan SQL Editor Supabase masing-masing:
   ```sql
   select (select count(*) from events) as events, (select count(*) from orders) as orders,
          (select count(*) from tickets) as tickets, (select count(*) from admins) as admins;
   ```
   - Berhasil bila: angkanya sama, atau produksi sedikit lebih banyak karena pesanan baru setelah jam backup.
4. **Catat hasilnya** di sini, lalu hapus database uji.

| Tanggal | Dump | Hasil | Oleh |
|---|---|---|---|
| | | | |

Catatan:
- Dump hanya berisi schema `public`. Jadwal pg_cron (sweeper hold, retensi identitas) ada di schema `cron`. Setelah restore ke project baru, jalankan `DB_WRITE_ALLOWED=true npm run db:migrate`, lalu periksa `select jobname from cron.job`. Bila kedua job tidak ada, terapkan ulang `db/migrations/0004_payment.sql` dan `0011_retention.sql` lewat `npm run db:apply`.
- Bucket gambar (Supabase Storage) tidak ikut dump. Poster dan logo bisa diunggah ulang dari panel.
