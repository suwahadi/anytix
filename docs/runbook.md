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
