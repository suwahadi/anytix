# Desain revamp beranda dan kerangka publik Anytix

Tanggal: 18 Oktober 2026. Sumber: permintaan pemilik di sesi ini, PRD §8 dan §17 (tata letak meniru Artatix), referensi `https://artatix.co.id/`, dan spec MVP `2026-10-17-anytix-mvp-design.md`.

## Maksud

Beranda Anytix sekarang terasa kosong dibanding referensi. Isinya hanya judul + kotak cari, "Event pilihan", kapsul kategori, dan grid "Event terdekat". Footernya juga tipis.

Pemilik ingin susunan beranda, header, dan footer mengikuti artatix.co.id: dari menu, hero slider, deretan kartu, banner "Laris Manis", kategori, grid event, sampai footer empat kolom dengan copyright. Tujuannya agar situs terlihat seperti platform tiket yang matang ketika dibuka calon pembeli dan penyelenggara.

## Keputusan pemilik (18 Okt 2026)

| Topik | Keputusan |
|---|---|
| Susunan | Mengikuti artatix.co.id dari menu sampai footer, sesuai wireframe yang disetujui (`.superpowers/brainstorm/…/home-structure.html`) |
| "Temukan Event Menarik di Kotamu!" | Tidak dipakai |
| Tombol tema | Ikon saja, tanpa label teks |
| Footer | Empat kolom sampai baris copyright |
| Data yang belum ada | Usul agent disetujui: tanpa event rekaan dan tanpa tautan mati. Detail di "Aturan konten" |
| Poster di hero dan Laris Manis | Opsi B: poster utuh di tengah, latar poster yang sama diburamkan |

## Aturan konten (disetujui pemilik)

1. **Hero slider:**
   - Slide utama adalah poster event sungguhan yang ditandai "featured".
   - Bila slide kurang dari 3, sisanya diisi banner umum memakai foto dari `images.unsplash.com` (alamat foto tetap, bukan `source.unsplash.com`). Copy-nya ajakan nyata yang menuju halaman yang ada, misalnya "Jelajahi event" ke `/events`, dan tanpa nama, tanggal, atau harga event rekaan.
2. **Rekomendasi, Laris Manis, Event Terdekat:** hanya event sungguhan. Bagian tanpa data tidak ditampilkan. Carousel tanpa cukup kartu untuk digeser tidak menampilkan panah.
3. **Menu dan footer:** halaman yang belum ada tetap tampil dengan tanda kecil **"Segera"**, tidak bisa diklik, dan tidak menjadi tautan `#`. Begitu halamannya dibuat, tandanya dicabut.
4. **Ikon media sosial:** ditampilkan hanya bila ada URL asli. Saat ini belum ada, jadi baris ikon tidak tampil.

## Susunan halaman

Berlaku untuk header dan footer semua halaman publik (`src/app/(public)/layout.tsx`), dan isi beranda (`src/app/(public)/page.tsx`). Halaman detail event, tiket, checkout, dan pesanan tidak diubah, kecuali karena header dan footer bersama.

### Header

- Kiri: logo situs (gambar dari Pengaturan Situs, atau nama situs sebagai teks).
- Tengah, mulai layar lebar: menu kapsul. "Beranda" aktif di `/`, dan "Jelajah Event" aktif di `/events*`. Item yang aktif memakai warna aksen.
- **Item menu:**
  - **Beranda** → `/`.
  - **Jelajah Event** → `/events`.
  - **Tentang**: "Segera".
  - **Hubungi Kami** → tautan ke bagian kontak di footer (`#kontak`). Tujuannya nyata, karena WhatsApp dan email CS sudah ada di pengaturan. Bila keduanya kosong, item ini tidak tampil.
- Kanan:
  - Tombol ikon **cari**, yang menuju `/events` dengan fokus di kotak cari.
  - Tombol ikon **tema** (sistem, terang, gelap, bergantian) tanpa label teks. Tetap memakai `aria-label` dan `title` yang menyebut mode aktif.
  - Tidak ada "Masuk" (pembeli tidak punya akun) dan tidak ada pilihan bahasa.
- Ponsel: logo, ikon cari, ikon tema, dan tombol menu. Menu terbuka sebagai panel berisi item yang sama.

### Beranda, berurutan

1. **Judul halaman** tersembunyi untuk pembaca layar (`h1` sr-only), karena hero berisi gambar.
2. **Hero slider:**
   - Banner lebar dengan rasio sekitar 3:1 di desktop dan 16:9 di ponsel.
   - **Poster tampil utuh di tengah** (16:9, tidak dipotong). Sisi kiri-kanan bingkai diisi poster yang sama, diperbesar dan diburamkan. Pilihan pemilik B, 18 Okt 2026. Berlaku juga untuk banner Laris Manis. Di ponsel bingkainya 16:9, jadi poster mengisi penuh tanpa latar buram.
   - Banner umum Unsplash memakai foto yang memenuhi bingkai, ditambah lapisan gelap di belakang teks agar kontras AA.
   - Slide tetangga mengintip di kiri-kanan pada layar lebar.
   - Panah ‹ › dan titik penanda slide.
   - Bisa digeser dengan jari, karena memakai scroll-snap.
   - Berganti otomatis tiap 6 detik. Berhenti saat disentuh, di-hover, atau difokus, dan tidak berjalan sama sekali bila `prefers-reduced-motion`.
   - Ada tombol jeda yang bisa diakses keyboard (WCAG 2.2.2).
   - Setiap slide event menuju halaman event itu.
3. **Rekomendasi Event:**
   - Judul rata kiri. Carousel kartu: 4 kartu terlihat di desktop, dan sekitar 1,3 kartu di ponsel sehingga terlihat bisa digeser.
   - Panah ‹ › muncul hanya bila ada kartu di luar layar.
   - Isinya event featured, boleh sama dengan isi hero (katalog masih kecil, jadi bagian yang saling membuang duplikat akan cepat kosong). Bila belum ada event featured, isinya event terbit yang belum selesai, diurutkan dari yang paling dekat waktunya, maksimal 8. *Keputusan agent.*
4. **Laris Manis:**
   - Judul dan satu kalimat pendek di tengah.
   - Carousel banner lebar dengan tetangga mengintip, dan label nama event di bagian bawah banner.
   - Isinya event terbit yang **belum selesai** (`ends_at > now()`), diurutkan dari jumlah tiket terjual terbanyak (`sold` sungguhan, minimal 1), maksimal 6. Event yang sudah lewat tidak ikut, karena tiketnya tidak bisa dibeli lagi. Tidak tampil bila belum ada yang terjual. *Keputusan agent.*
5. **Kategori Event:**
   - Satu baris ikon bulat dengan label kapsul di bawahnya. Di ponsel bisa digeser.
   - Isinya semua kategori aktif. Ikonnya gambar yang diunggah admin di Kategori Event; bila belum ada, tile berisi huruf awal kategori.
   - Setiap kategori menuju `/events?category=<slug>`.
6. **Event Terdekat:** grid 4 kolom × 2 baris di desktop (2 kolom di tablet, 1 di ponsel), lalu tombol **"Lihat Lainnya"** ke `/events`. Bila belum ada event, tampilkan empty state yang sudah ada.

### Kartu event (dipakai di Rekomendasi, Event Terdekat, dan halaman Jelajah)

- Isi dari atas ke bawah:
  - Poster 16:9.
  - Judul, maksimal 2 baris.
  - Tanggal dengan ikon kalender, diikuti kota (`20 Des 2026 · Jakarta Pusat`). Kota tetap ada karena halaman Jelajah dipakai untuk mencari per kota. Label kategori di atas judul dibuang, mengikuti referensi, karena Jelajah sudah punya filter kategori. *Keputusan agent.*
  - Harga "Mulai dari Rp…" dengan angka dalam warna aksen.
  - Garis pemisah.
  - Logo penyelenggara (bulat; huruf awal bila tidak ada logo) dan nama penyelenggara.
- Satu area klik untuk seluruh kartu, menuju halaman event.

### Footer

- Latar gelap netral (`stone`), di kedua tema.
- **Kolom 1 (brand), `id="kontak"`:** logo atau nama situs, tagline "Beli tiket event tanpa perlu daftar akun.", lalu kontak CS (WhatsApp dan email) bila diisi.
- **Kolom 2, Tentang Kami:**
  - Tentang: "Segera".
  - Biaya: "Segera".
  - Hubungi Kami → `#kontak`.
- **Kolom 3, Informasi:**
  - Syarat & Ketentuan → `/terms`.
  - Kebijakan Privasi & Pemrosesan Data → `/privacy`.
  - FAQ: "Segera".
- **Kolom 4, Kategori Event:** sampai 5 kategori yang punya event, lalu "Semua Kategori" ke `/events`.
- **Baris bawah:** garis pemisah, lalu "© {tahun} {nama situs}. Hak Cipta Dilindungi." di kiri. Ikon media sosial di kanan, hanya bila ada URL.
- Ponsel: kolom bertumpuk satu per satu, dan semua tautan punya target sentuh minimal 44 px.

## Identitas visual

- **Tetap identitas Anytix, bukan biru Artatix:**
  - Palet netral `stone` dengan satu aksen merah bata `#C2410C`, dipakai di menu aktif, harga, titik slider aktif, dan tombol utama.
  - Font Plus Jakarta Sans.
  - Yang ditiru dari Artatix adalah susunan dan perilaku, bukan warnanya.
- **Dial:**
  - ENERGY 1 / RHYTHM 2 tetap seperti spec MVP.
  - MOTION naik ke **2 khusus beranda**, karena slider dan carousel bergerak. Batasnya: transisi geser 300 ms, dan semua gerak mati di `prefers-reduced-motion`. Ini keputusan agent.
- **Ikon:** satu set SVG garis yang konsisten, digambar langsung di kode (cari, tema, kalender, panah, jeda, menu). Tidak memakai emoji. Tidak menambah dependensi ikon.
- **Kedua tema** harus lulus kontras WCAG AA. Kartu dan footer diperiksa di terang dan gelap.

## Batasan teknis

- Next.js 16.4 dengan `cacheComponents`. Data beranda tetap memakai fungsi cache `PUBLIC_CACHE` yang sudah ada. Slider dan carousel berupa komponen klien kecil yang hanya mengurus geser, panah, autoplay, dan titik; datanya dikirim dari server component.
- **Query:**
  - Tambahan: Laris Manis (event dengan total `sold` tertinggi), dan logo penyelenggara untuk kartu.
  - Tidak ada perubahan skema database.
- **CSP:** `img-src` ditambah `https://images.unsplash.com`. Foto Unsplash di-load lewat image loader yang ada, atau `<img>` biasa bila loader tidak cocok. Foto tidak di-hotlink dari `source.unsplash.com`.
- **Aturan yang tetap berlaku:**
  - AGENTS.md: tanpa komentar anotasi, dan `cursor: pointer` di semua tautan dan tombol.
  - Bahasa Indonesia di UI.
  - Antislop Delivery Gate sebelum diserahkan.

## Bukan bagian pekerjaan ini

- Halaman Tentang, Biaya, dan FAQ (tetap "Segera").
- Pengaturan URL media sosial di panel.
- Banner hero yang diunggah terpisah dari poster event.
- Halaman detail event dan tiket.
- Login pembeli dan pilihan bahasa.

## Diserahkan ke builder

- Foto Unsplash mana yang dipakai: 3 foto suasana konser, pameran, atau teater; pilih yang terang dan tidak menampilkan wajah yang jelas.
- Copy pendek untuk banner umum dan kalimat di bawah "Laris Manis", dengan aturan copy antislop: tanpa buzzword dan tanpa klaim.
- Ukuran spacing dan detail komponen dalam batas identitas di atas.
- Gaya tanda "Segera": teks kecil di samping label, dengan kontras AA.
