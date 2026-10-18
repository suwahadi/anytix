-- Editable public content: About and Contact pages live in settings like the legal pages; FAQ items get their own ordered table.
create table public.faqs (
  id bigint generated always as identity primary key,
  question text not null check (length(question) between 5 and 200),
  answer text not null default '',
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.faqs enable row level security;
revoke all on public.faqs from anon, authenticated;
revoke all on sequence public.faqs_id_seq from anon, authenticated;

insert into public.faqs (question, answer, position)
select q, a, p
  from (values
    ('Apakah saya harus membuat akun untuk membeli tiket?',
     '<p>Tidak perlu. Cukup isi nama, email, dan nomor WhatsApp saat memesan. E-ticket dikirim ke email yang Anda isi.</p>', 1),
    ('Metode pembayaran apa saja yang bisa dipakai?',
     '<p>QRIS (semua e-wallet dan m-banking) dan Virtual Account bank. Pilihan yang tampil di halaman pembayaran mengikuti metode yang sedang aktif.</p>', 2),
    ('Berapa lama tiket saya dikunci saat mengisi data?',
     '<p>Selama batas waktu yang tampil di halaman pemesanan. Jika waktunya habis, ulangi pemesanan. Data yang sudah Anda isi tetap tersimpan.</p>', 3),
    ('Kapan e-ticket saya dikirim?',
     '<p>Segera setelah pembayaran terkonfirmasi. E-ticket dikirim ke email pemesan dan juga bisa diunduh dari halaman pesanan.</p>', 4),
    ('Email e-ticket tidak masuk, apa yang harus saya lakukan?',
     '<p>Periksa folder spam atau promosi terlebih dahulu. Jika tetap tidak ada, hubungi kami dan sertakan nomor invoice pesanan Anda.</p>', 5),
    ('Bagaimana cara masuk ke lokasi event?',
     '<p>Tunjukkan QR pada e-ticket di pintu masuk, dari layar ponsel atau hasil cetak. Satu QR berlaku untuk satu orang dan hanya bisa dipakai sekali. Untuk event yang meminta nomor identitas, bawa kartu identitas yang sama dengan yang Anda isi.</p>', 6),
    ('Apakah tiket bisa dibatalkan atau di-refund?',
     '<p>Kebijakan refund berbeda untuk setiap event dan tercantum di halaman detail event pada bagian Kebijakan Refund.</p>', 7)
  ) as seed(q, a, p)
 where not exists (select 1 from public.faqs);

insert into public.settings (key, value) values (
  'pages',
  jsonb_build_object(
    'about',
    '<h2>Lorem ipsum dolor sit amet</h2><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer posuere erat a ante venenatis dapibus posuere velit aliquet. Donec ullamcorper nulla non metus auctor fringilla.</p><p>Maecenas sed diam eget risus varius blandit sit amet non magna. Cras mattis consectetur purus sit amet fermentum. Nullam quis risus eget urna mollis ornare vel eu leo.</p><h3>Vestibulum id ligula</h3><ul><li>Aenean lacinia bibendum nulla sed consectetur.</li><li>Cum sociis natoque penatibus et magnis dis parturient montes.</li><li>Etiam porta sem malesuada magna mollis euismod.</li></ul>',
    'contact',
    '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur blandit tempus porttitor. Donec sed odio dui.</p><h3>Jam layanan</h3><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla vitae elit libero, a pharetra augue.</p>'
  )
) on conflict (key) do nothing;
