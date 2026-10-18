# Runbook operasional Anytix

Panduan untuk pemilik dan pengelola. Setiap langkah ditulis dengan menu, nilai, dan cara memastikan langkah itu berhasil. Perintah `npm run …` dijalankan di folder aplikasi di VPS, kecuali disebut lain.

## Peta sistem

| Bagian | Di mana | Rahasia disimpan di |
|---|---|---|
| Domain `anytix.web.id` | Registrar domain; DNS di Cloudflare atau registrar | Akun registrar/Cloudflare |
| Aplikasi web (`anytix-web`) dan worker (`anytix-worker`) | VPS Singapura, dikelola aaPanel, dijalankan PM2 dari folder aplikasi (misalnya `/www/wwwroot/anytix`) | `.env.local` di folder aplikasi |
| HTTPS dan reverse proxy | Nginx aaPanel (Website → `anytix.web.id`), sertifikat Let's Encrypt | aaPanel |
| Database, jadwal sweeper, gambar | Supabase (project yang sama dengan dev) | `.env.local` (`DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) |
| Pembayaran | Midtrans (mode Production) | `.env.local` (`MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`) |
| Email | Brevo SMTP | Panel → Pengaturan → Email (password terenkripsi di database) |
| Anti-bot | Cloudflare Turnstile | `.env.local` (`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`) |
| Backup | `/www/backup/anytix` di VPS + salinan luar VPS | — |

Yang paling penting: `DATA_ENCRYPTION_KEY` dan `COOKIE_SECRET` di `.env.local`. Simpan salinannya di password manager pemilik.
- Bila `DATA_ENCRYPTION_KEY` hilang, nomor identitas, password SMTP, dan secret 2FA di database tidak bisa dibaca lagi.

## Deploy pertama (aaPanel, site anytix.web.id yang sudah ada sebagai PHP project)

Site `anytix.web.id` yang sudah dibuat di aaPanel dipertahankan, karena domain dan sertifikat SSL-nya ada di sana. Yang diubah hanya cara site itu melayani request: bukan lagi PHP, tapi diteruskan (reverse proxy) ke aplikasi Node di `127.0.0.1:3100`. Kode aplikasi diletakkan di folder terpisah, `/www/wwwroot/anytix`. Folder bawaan site (`/www/wwwroot/anytix.web.id`) tidak dipakai lagi.

Urutan kerja: **A** cek VPS → **B** pasang Node dan PM2 → **C** ambil kode dan isi `.env.local` → **D** build dan jalankan → **E** ubah site PHP menjadi reverse proxy → **F** firewall → **G** verifikasi → **H** langkah sesudahnya.

### A. Cek VPS

1. Masuk SSH sebagai root. aaPanel → Terminal juga bisa.
2. Cek RAM: `free -h`. Build Next.js butuh sekitar 2 GB.
   - Bila RAM di bawah 2 GB atau `Swap` bernilai 0, buat swap 2 GB:
     ```bash
     fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
     echo '/swapfile none swap sw 0 0' >> /etc/fstab
     ```
   - Berhasil bila: `free -h` menampilkan Swap 2.0Gi.
3. Cek IP publik VPS: `curl -4 ifconfig.me`. Catat IP-nya, karena dipakai untuk DNS dan Brevo.

### B. Pasang Node 22, PM2, git

1. aaPanel → **App Store** → cari **Node.js version manager** → Install.
2. Buka Node.js version manager → pilih versi **v22.x (LTS)** → Install. Setelah selesai, jadikan versi itu yang dipakai command line (tombol **Set as command-line version** atau sejenisnya).
3. Di Terminal:
   ```bash
   node -v          # harus v22.x
   npm -v
   npm install -g pm2
   pm2 -v
   git --version || apt install -y git
   ```
   - Berhasil bila: keempat perintah menampilkan versi.
   - Jangan membuat "Node Project" di menu Website aaPanel untuk aplikasi ini. Aplikasi dijalankan oleh PM2 lewat `deploy/ecosystem.config.cjs`. Dua pengelola untuk satu aplikasi akan saling bentrok di port aplikasi (3100).

### C. Ambil kode dan isi `.env.local`

1. Clone repo:
   ```bash
   cd /www/wwwroot
   git clone https://github.com/suwahadi/anytix.git anytix
   cd anytix
   cp .env.production.example .env.local
   chmod 600 .env.local
   ```
2. Buat site key Turnstile untuk domain: dashboard Cloudflare → **Turnstile** → Add widget.
   - Nama: `AnyTix`.
   - Hostname: `anytix.web.id`.
   - Mode: **Managed**.

   Salin Site Key dan Secret Key. Turnstile bisa dipakai walau DNS domain tidak di Cloudflare.
3. Isi `.env.local` dengan `nano .env.local`:

   | Variabel | Isi |
   |---|---|
   | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_MEDIA_BASE_URL` | Sama persis dengan `.env.local` di laptop (database yang sama) |
   | `DATABASE_URL_DIRECT` | Supabase → Connect → **Session pooler** (port 5432), untuk backup |
   | `COOKIE_SECRET`, `DATA_ENCRYPTION_KEY` | **Salin dari `.env.local` laptop. Jangan membuat baru**, karena data terenkripsi yang sudah ada harus tetap terbaca |
   | `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION` | Tahap pertama boleh key **sandbox** dengan `MIDTRANS_IS_PRODUCTION=false`, untuk mencoba situs dulu. Ganti ke key produksi dan `true` saat bagian "Midtrans produksi" dikerjakan |
   | `APP_URL` | `https://anytix.web.id` (sudah terisi) |
   | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Dari langkah 2 |
   | `SMTP_*` | Cadangan bila pengaturan email di panel kosong. `SMTP_FROM` sudah terisi `AnyTix <no-reply@anytix.web.id>` |
   | `TRUST_PROXY=true`, `RATE_LIMIT_SCALE=1` | Sudah terisi, jangan diubah |
   | `DB_TESTS_ALLOWED`, `DB_WRITE_ALLOWED` | **Jangan ditambahkan** di server |

   Simpan dengan `Ctrl+O`, Enter, lalu keluar dengan `Ctrl+X`.
   - Berhasil bila: `grep -c '=$' .env.local` hanya menghitung baris yang memang boleh kosong (`MIDTRANS_NOTIFICATION_URL` dan baris komentar).

### D. Build dan jalankan aplikasi

1. Deploy:
   ```bash
   cd /www/wwwroot/anytix
   bash deploy/deploy.sh
   ```
   Proses pertama makan waktu 3–10 menit (`npm ci` lalu build). Migrasi akan menjawab `up to date`, karena database sudah termigrasi dari laptop.
   - Berhasil bila: baris terakhir `{"ok":true,"db":"ok",…}` lalu `Deploy selesai.`
   - Bila build berhenti dengan `Killed`, RAM tidak cukup. Buat swap (A.2), lalu ulangi.
2. Pastikan PM2 hidup lagi setelah VPS reboot:
   ```bash
   pm2 startup          # salin dan jalankan perintah "sudo env PATH=..." yang dicetaknya
   pm2 save
   pm2 status           # anytix-web dan anytix-worker: online
   ```
3. Hentikan worker di laptop. Mulai sekarang worker produksi yang memproses antrean. Laptop hanya boleh menjalankan worker bila server mati dan Anda sengaja mengambil alih.

### E. Ubah site PHP `anytix.web.id` menjadi reverse proxy

1. **DNS:** di pengelola DNS domain, buat record **A** `anytix.web.id` ke IP VPS (A.3). Tambahkan juga `www` sebagai CNAME ke `anytix.web.id` bila ingin `www` ikut.
   - Bila DNS di Cloudflare, biarkan dulu **DNS only** (awan abu-abu) sampai SSL terpasang.
   - Berhasil bila: `ping anytix.web.id` menjawab dari IP VPS.
2. **Matikan PHP:** aaPanel → **Website** → `anytix.web.id` → **Conf** (atau klik nama site) → tab **PHP version** → pilih **Static** / **Pure static** → Switch.
3. **SSL:** di jendela yang sama, tab **SSL** → **Let's Encrypt** → centang `anytix.web.id` (dan `www.anytix.web.id` bila ada) → Apply. Setelah terbit, nyalakan **Force HTTPS**.
   - Berhasil bila: tab SSL menampilkan sertifikat dengan tanggal kedaluwarsa sekitar 90 hari ke depan.
4. **Edit config Nginx:** tab **Config file** (atau Config). Di dalam blok `server { … }`:
   1. **Hapus** baris `include enable-php-…conf;` bila masih ada.
   2. **Hapus** dua blok cache statis bawaan aaPanel. Bentuknya seperti ini:
      ```nginx
      location ~ .*\.(gif|jpg|jpeg|png|bmp|swf)$ { expires 30d; … }
      location ~ .*\.(js|css)?$ { expires 12h; … }
      ```
      Kedua blok ini mencari file di folder site lama, sehingga semua file `/_next/static/…js` dan `.css` aplikasi menjadi 404 dan halaman tampil tanpa gaya.
   3. **Biarkan** blok `location ~ \.well-known` (perpanjangan SSL otomatis), blok larangan file seperti `.user.ini` dan `.git`, baris `ssl_*`, dan baris `access_log` / `error_log`.
   4. **Tempel** seluruh isi file `deploy/nginx-anytix.conf` dari repo tepat sebelum kurung kurawal penutup `}` terakhir blok server. Lihat isinya di VPS dengan `cat /www/wwwroot/anytix/deploy/nginx-anytix.conf`.
   5. Bila DNS **tidak** lewat proxy Cloudflare, baris `set_real_ip_from …` dan `real_ip_header …` boleh dihapus. Dibiarkan pun tidak berbahaya.
   6. **Save.** aaPanel menguji config sebelum menyimpan. Bila muncul error, baca baris yang disebut. Biasanya kurung kurawal tidak seimbang, atau ada dua blok `location /`. Hapus `location /` lama bila ada.
5. **Jangan** memakai menu **Reverse proxy** aaPanel untuk site ini. Proxy sudah diatur di config, dan dua pengaturan proxy akan bentrok.
6. **Cloudflare (opsional, setelah SSL jalan):** nyalakan awan oranye, lalu atur Cloudflare → SSL/TLS → mode **Full (strict)**. Mode Flexible menyebabkan redirect berulang.

### F. Firewall

aaPanel → **Security**: yang terbuka hanya port **22** (SSH), **80**, **443**, dan port panel aaPanel. Port **3100** (dan port aplikasi lain) **tidak boleh dibuka**. Aplikasi memang hanya mendengar di `127.0.0.1`, tapi aturan ini menutup celah bila suatu saat salah konfigurasi.

### G. Verifikasi

Di VPS:
```bash
curl -s https://anytix.web.id/api/health        # {"ok":true,"db":"ok",...}
curl -sI https://anytix.web.id | grep -iE "^HTTP|strict-transport|content-security"
curl -sI https://anytix.web.id/_next/static/ 2>/dev/null | head -1   # bukan 404 dari nginx folder lama
pm2 status
```
Di browser (ponsel dan laptop):
1. `https://anytix.web.id` terbuka, bergaya normal, dan gambar event tampil.
2. `https://anytix.web.id/admin/login` → masuk dengan akun admin Anda.
3. Pilih tiket di event, sampai langkah pembayaran. Widget Turnstile harus muncul tanpa error. Bila tahap ini masih memakai key sandbox Midtrans, pembayaran bisa dicoba dengan simulator sandbox.
4. Panel → Check-in terbuka dan kamera bisa diizinkan (butuh HTTPS, yang sekarang sudah ada).

| Masalah | Penyebab dan perbaikan |
|---|---|
| `502 Bad Gateway` | Aplikasi tidak jalan. Cek `pm2 status` dan `pm2 logs anytix-web --lines 100`. |
| Halaman tanpa gaya, file `/_next/static/…` 404 | Blok cache statis aaPanel (E.4.2) masih ada. Hapus, lalu Save. |
| `ERR_TOO_MANY_REDIRECTS` | Cloudflare SSL mode masih Flexible. Ubah ke Full (strict). |
| Turnstile error atau "Verifikasi keamanan gagal" | Hostname widget bukan `anytix.web.id`, atau key di `.env.local` salah. Perbaiki, lalu `bash deploy/deploy.sh` (site key dibaca saat build). |
| Login admin langsung keluar lagi | `APP_URL` bukan https, atau `COOKIE_SECRET` berbeda dari laptop. Samakan, lalu deploy ulang. |
| Upload poster gagal (413) | `client_max_body_size 11m;` dari snippet belum tersimpan di config. |

### H. Sesudah situs jalan

Kerjakan berurutan, masing-masing ada di bagian runbook berikutnya:
1. **Midtrans produksi:** key produksi, URL notifikasi, `npm run midtrans:check`.
2. **Email dari domain:** Brevo domain, DKIM/DMARC, IP VPS, kotak masuk `cs@anytix.web.id`.
3. **Backup dan restore:** `postgresql-client`, cron harian, uji restore.
4. **Monitor uptime:** UptimeRobot → New monitor → HTTP(s) → `https://anytix.web.id/api/health`, interval 5 menit, alert ke email/WhatsApp Anda.
5. **Ganti `admin@admin.com`** di Panel → Admin & Audit dan pastikan semua admin memakai 2FA. Lalu di laptop, hapus baris `DB_TESTS_ALLOWED=true` dan `DB_WRITE_ALLOWED=true` dari `.env.local`.
6. **Gerbang terakhir:** di VPS jalankan `npm run preflight`.
   - Berhasil bila: semua baris PASS dan tertulis `Siap produksi.`

## Deploy rutin dan rollback

- **Update:** di folder aplikasi jalankan `bash deploy/deploy.sh`. Skrip ini mengambil kode terbaru, memasang migrasi baru, build, lalu reload tanpa mematikan situs.
- **Bila deploy.sh gagal di tengah:** situs tetap berjalan dengan versi lama, karena PM2 belum di-reload. Baca pesan error, perbaiki, ulangi.
- **Rollback ke versi sebelumnya:**
  ```bash
  git log --oneline -5              # pilih commit yang terakhir sehat
  git checkout <commit> && npm ci && npm run build && pm2 reload deploy/ecosystem.config.cjs --update-env
  git checkout main                 # setelah perbaikan siap, kembali dan deploy normal
  ```
  Migrasi database hanya maju. Bila versi baru sudah menambah kolom, versi lama biasanya tetap jalan. Bila tidak, minta agent membuat migrasi perbaikan, jangan menghapus kolom manual.
- **Log:** `pm2 logs anytix-web --lines 200` dan `pm2 logs anytix-worker --lines 200`.

## Sebelum on-sale event besar

H-1 sampai H-3 sebelum penjualan dibuka:

1. **Panel → Pengaturan → Transaksi:**
   - Lama kunci slot: 3 menit (bawaan), naikkan bila form pemesan panjang.
   - Batas bayar dan cadangannya.
   - Biaya layanan.
   - Metode bayar: hanya yang OK di `npm run midtrans:check`.

   Perubahan hanya berlaku untuk transaksi baru.
2. **Event → kategori tiket:** harga, kuota, periode jual, maksimal per transaksi, dan status Aktif. Buka halaman tiket publik dan cek tampilannya di ponsel.
3. **Voucher** (tab Voucher di event): kode, kuota, periode. Coba satu kode di checkout lalu batalkan.
4. **Teknis:**
   - `https://anytix.web.id/api/health` menjawab ok.
   - `pm2 status`: kedua proses online.
   - `RATE_LIMIT_SCALE=1` di `.env.local`.
   - `npm run preflight` semua PASS.
5. **Email:** kirim email uji dari panel dan cek kuota harian paket Brevo.
6. **Saat penjualan dibuka:**
   - Pantau Dasbor (hold aktif, pesanan lunas) dan `pm2 logs anytix-web`.
   - Lonjakan pesan `Terlalu banyak percobaan` wajar, karena rate limit bekerja.

## Hari-H gerbang

1. **Akun petugas:** pakai akun admin dengan 2FA aktif. Bila petugas memakai akun bersama, ganti kata sandinya setelah acara. Ganti kata sandi otomatis mengeluarkan semua perangkat lain.
2. **Siapkan ponsel:**
   - Buka `https://anytix.web.id/admin/check-in` dan masuk.
   - Pasang sebagai aplikasi: Chrome ⋮ → Install app, atau Safari Share → Add to Home Screen.
   - Pilih event, isi nama gate (A, B, Utara, …), lalu **Mulai scan** dan izinkan kamera.
3. **Arti layar:**

   | Layar | Arti dan tindakan |
   |---|---|
   | Hijau **VALID** | Persilakan masuk. Bila identitas tampil, cocokkan dengan kartu identitas. |
   | Merah **SUDAH DIPAKAI pukul …, Gate …** | Tiket sudah masuk sebelumnya. Arahkan ke meja bantuan. |
   | Merah **TIDAK VALID** | Bukan tiket event ini, QR sudah diterbitkan ulang, atau bukan QR tiket. |
   | Abu-abu **Koneksi gagal** | Sinyal hilang. Scan ulang, atau pakai ponsel lain. |

4. **Tanpa sinyal:** scanner hanya bekerja online. Siapkan hotspot cadangan di gerbang. Kode di bawah QR bisa diketik di kolom "Kode manual" bila kamera bermasalah.
5. **Tautan tiket bocor atau tiket dicurigai digandakan:** buka Panel → Pesanan → pesanan itu → **Terbitkan ulang QR**. QR lama langsung TIDAK VALID. Pembeli melihat QR baru di tautan pesanan yang sama.
6. **Pantau:** Panel → Check-in menampilkan kehadiran per kategori dan riwayat scan per gate.

## Insiden

| Gejala | Penyebab umum | Tindakan |
|---|---|---|
| Monitor uptime: `/api/health` 503 dengan `db: "down"` | Database Supabase tidak terjangkau | Cek status.supabase.com dan Supabase → project status. Aplikasi pulih sendiri saat database kembali. |
| `/api/health` 503 dengan `oldestQueuedJobSec` besar | Worker mati | `pm2 status`. Bila `anytix-worker` tidak online, jalankan `pm2 restart anytix-worker`, lalu cek `pm2 logs anytix-worker`. |
| Pembeli sudah bayar tapi status masih PENDING | Notifikasi Midtrans gagal masuk | Tunggu 1–2 menit; worker mengecek status ke Midtrans sendiri. Cek Midtrans → Settings → Notification URL dan riwayatnya. Detail pesanan di panel menunjukkan event pembayaran yang diterima. |
| Email admin "selisih kuota" | Data `sold`/`held` tidak cocok dengan hold | Worker memperbaikinya setiap jam. Bila berulang, minta agent memeriksa. Jangan ubah kuota langsung di database. |
| Pesanan berstatus **Perlu tindak lanjut** (pembayaran terlambat, kuota habis) | Pembeli membayar setelah batas waktu | Pilih: naikkan kuota lalu **Terbitkan tiket**, atau refund di dashboard Midtrans lalu **Tandai sudah direfund**. Hubungi pembeli. |
| Email tidak sampai | IP VPS belum diizinkan, kuota Brevo habis, atau masuk spam | Brevo → Transactional → Logs. `525 Unauthorized IP` berarti tambahkan IP VPS di Authorised IPs. Kirim ulang dari Panel → Pesanan → **Kirim ulang email**. |
| Banyak pembeli melihat `Terlalu banyak percobaan` | Rate limit per IP, sering pada jaringan seluler yang berbagi IP | Bila mengganggu saat on-sale, naikkan `RATE_LIMIT_SCALE` (misalnya 2) di `.env.local`, lalu `pm2 reload anytix-web --update-env`. Kembalikan setelahnya. |
| Situs tidak terbuka, health tidak menjawab | Proses web mati atau Nginx bermasalah | `pm2 status`, `pm2 restart anytix-web`, aaPanel → Nginx → Restart. Cek sertifikat SSL masih berlaku. |

## Akun dan rahasia

- **Tambah, ganti email, atau nonaktifkan admin:** Panel → Admin & Audit → Akun admin. Admin yang dinonaktifkan langsung keluar. Minimal harus ada satu admin aktif.
- **2FA hilang:**
  - Admin lain membuka Panel → Admin & Audit → **Reset 2FA**.
  - Bila tidak ada admin lain, jalankan di VPS: `DB_WRITE_ALLOWED=true npm run admin:reset-2fa -- email@domain`.
  - Setelah itu, aktifkan 2FA lagi di halaman Keamanan.
- **Admin pertama dari VPS** bila semua akun terkunci: `DB_WRITE_ALLOWED=true ADMIN_PASSWORD='…' npm run admin:create -- email@domain`.
- **Ganti kata sandi sendiri:** Panel → Keamanan. Semua perangkat lain otomatis keluar.
- **Kebocoran rahasia:**
  - `COOKIE_SECRET`: buat baru, isi `.env.local`, lalu `pm2 reload anytix-web --update-env`. Semua admin harus masuk ulang.
  - Key Midtrans dan Brevo: buat ulang di dashboard masing-masing, lalu perbarui `.env.local` atau panel.
  - `DATA_ENCRYPTION_KEY` **jangan** diganti tanpa skrip enkripsi ulang. Hubungi agent.
- **Audit:** semua perubahan dan pembukaan nomor identitas tercatat di Panel → Admin & Audit → Audit log.

## Data pribadi (PDP)

- **Nomor identitas:** tersimpan terenkripsi dan tampil tersamar (`3201********0001`) di panel, PDF, CSV, dan scanner. Nomor lengkap hanya lewat tombol **Tampilkan nomor lengkap** di detail pesanan, dan setiap pembukaan tercatat di audit log. Batasi siapa saja yang memegang akun admin.
- **Retensi:** nomor identitas dihapus otomatis 60 hari setelah event selesai, setiap hari pukul 02.30 WIB. Jenis identitasnya tetap tersimpan.
- **Permintaan hapus data dari pembeli:**
  - Catat permintaannya.
  - Bila pesanan sudah lunas dan event belum lewat, jelaskan bahwa tiket ikut tidak berlaku.
  - Minta agent atau pengelola teknis menghapus jawaban form dan menyamarkan nama/email/WhatsApp pesanan itu lewat SQL yang ditinjau. Jangan menghapus baris pesanan, karena laporan keuangan membutuhkannya.
- **Ekspor CSV** berisi data pribadi pemesan (nama, email, WhatsApp). Simpan hanya selama dibutuhkan dan jangan dibagikan di grup chat.

## Kontak dan eskalasi

| Peran | Nama | Kontak |
|---|---|---|
| Pemilik | | |
| Pengelola teknis | | |
| Midtrans support | | support@midtrans.com |
| Brevo support | | lewat dashboard Brevo |
| Penyedia VPS | | |

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
3. **Tambahkan alamat pengirim.** Buka tab **Senders** → Add a sender: nama `AnyTix`, email `no-reply@anytix.web.id`.
   - Berhasil bila: sender tampil aktif. Domain yang sudah terautentikasi tidak perlu verifikasi kotak masuk.
4. **Izinkan IP VPS.** Buka Brevo → Security → **Authorised IPs** dan tambahkan IP publik VPS. Cek IP-nya dengan `curl -4 ifconfig.me` di VPS.
   - Bila langkah ini terlewat, pengiriman gagal dengan `525 5.7.1 Unauthorized IP address`. Penyebab ini juga yang paling umum bila email tiba-tiba berhenti.
5. **Pilih paket berbayar.** Paket gratis hanya 300 email/hari. Hitung kebutuhannya kira-kira 3 × jumlah pesanan per hari saat on-sale, lalu pilih paket di Brevo → Plans.
6. **Atur di panel.** Buka Panel → Pengaturan → Email:
   - Host `smtp-relay.brevo.com`, port `2525`. Port 587 dan 465 diblokir dari VPS ini (dicek 18 Okt 2026).
   - User dan password SMTP dari Brevo → SMTP & API → SMTP.
   - Pengirim `AnyTix <no-reply@anytix.web.id>`.

   Simpan, lalu tekan **Kirim email uji** ke alamat Anda sendiri.
   - Berhasil bila: email uji masuk ke Inbox (bukan Spam), dan `npm run preflight` baris **SMTP** menjadi PASS.
7. **Cek skor pengiriman.** Buka `mail-tester.com`, salin alamat yang ditampilkan, kirim email uji dari panel ke alamat itu, lalu klik "Then check your score".
   - Berhasil bila: skor ≥ 9/10. Bila lebih rendah, bagian DKIM dan DMARC di laporan itu menunjukkan record yang kurang.

8. **Siapkan kotak masuk `cs@anytix.web.id`.** Email ke pembeli dikirim dari `no-reply@anytix.web.id` dengan Reply-To `cs@anytix.web.id`, dan alamat CS itu juga tampil di situs. Brevo hanya mengirim, tidak menerima. Pilih salah satu:
   - **Cloudflare Email Routing** (gratis, bila DNS di Cloudflare): Email → Email Routing → aktifkan → rule `cs@anytix.web.id` diteruskan ke kotak masuk yang Anda baca.
   - **Email hosting** (Zoho Mail, Google Workspace, atau email dari penyedia domain).

   Ikuti record MX yang diminta layanan itu. Record MX tidak mengganggu record Brevo.
   - Berhasil bila: email dari alamat pribadi ke `cs@anytix.web.id` masuk, dan membalas email uji dari panel juga tiba di sana.

Pengirim `no-reply@anytix.web.id` baru bisa dipakai setelah domain berstatus Authenticated di Brevo (langkah 2–3). Sebelum itu Brevo bisa menolak atau menahan email dari alamat tersebut.

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
