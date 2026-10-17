create extension if not exists pgcrypto with schema extensions;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

create table public.event_categories (
  id bigint generated always as identity primary key,
  name text not null,
  slug text not null unique,
  icon text,
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.events (
  id bigint generated always as identity primary key,
  event_category_id bigint not null references public.event_categories (id),
  title text not null,
  slug text not null unique,
  description text not null default '',
  terms text not null default '',
  facilities text[] not null default '{}',
  refund_policy text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Jakarta'
    check (timezone in ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura')),
  venue text not null default '',
  city text not null default '',
  province text not null default '',
  map_url text,
  organizer_name text not null default '',
  organizer_logo_path text,
  social_links jsonb not null default '{}',
  poster_path text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sale_status text not null default 'closed' check (sale_status in ('on_sale', 'paused', 'closed')),
  seo jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);
create index events_status_category_idx on public.events (status, event_category_id);

create table public.slug_redirects (
  id bigint generated always as identity primary key,
  old_slug text not null unique,
  event_id bigint not null references public.events (id),
  created_at timestamptz not null default now()
);

create table public.event_sessions (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'closed' check (status in ('on_sale', 'paused', 'closed'))
);
create index event_sessions_event_idx on public.event_sessions (event_id);

create table public.ticket_categories (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events (id),
  name text not null,
  description text not null default '',
  price bigint not null check (price >= 1000),
  max_per_order int not null default 5 check (max_per_order between 1 and 50),
  admits_per_unit int not null default 1 check (admits_per_unit >= 1),
  has_merchandise boolean not null default false,
  sale_starts_at timestamptz not null,
  sale_ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'hidden')),
  position int not null default 0,
  created_at timestamptz not null default now(),
  check (sale_ends_at > sale_starts_at)
);
create index ticket_categories_event_idx on public.ticket_categories (event_id);

create table public.ticket_inventory (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.event_sessions (id),
  ticket_category_id bigint not null references public.ticket_categories (id),
  capacity int not null check (capacity >= 0),
  sold int not null default 0,
  held int not null default 0,
  unique (session_id, ticket_category_id),
  check (sold >= 0 and held >= 0 and sold + held <= capacity)
);

create table public.form_fields (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events (id),
  key text not null,
  label text not null,
  type text not null check (type in ('short_text', 'long_text', 'number', 'date', 'select', 'radio',
                                      'checkbox', 'chips', 'identity')),
  options jsonb not null default '[]',
  validation jsonb not null default '{}',
  help_text text,
  placeholder text,
  required boolean not null default false,
  position int not null default 0,
  is_active boolean not null default true,
  unique (event_id, key)
);

create table public.holds (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  event_id bigint not null references public.events (id),
  session_id bigint not null references public.event_sessions (id),
  status text not null check (status in ('held', 'pending_payment', 'paid', 'released', 'expired')),
  expires_at timestamptz not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (visitor_id, idempotency_key)
);
create unique index holds_one_active_per_visitor_event on public.holds (visitor_id, event_id) where status = 'held';
create index holds_expiring_idx on public.holds (expires_at) where status in ('held', 'pending_payment');
create index holds_event_idx on public.holds (event_id);

create table public.hold_items (
  id bigint generated always as identity primary key,
  hold_id uuid not null references public.holds (id),
  inventory_id bigint not null references public.ticket_inventory (id),
  qty int not null check (qty > 0),
  unit_price bigint not null,
  counted boolean not null default true
);
create index hold_items_counted_idx on public.hold_items (inventory_id) where counted;
create index hold_items_hold_idx on public.hold_items (hold_id);

create table public.vouchers (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events (id),
  code text not null,
  type text not null check (type in ('percent', 'fixed')),
  value bigint not null check (value > 0),
  max_discount bigint check (max_discount is null or max_discount > 0),
  min_qty int not null default 0 check (min_qty >= 0),
  min_subtotal bigint not null default 0 check (min_subtotal >= 0),
  ticket_category_ids bigint[],
  valid_from timestamptz,
  valid_to timestamptz,
  max_uses int check (max_uses is null or max_uses >= 0),
  used int not null default 0 check (used >= 0),
  held int not null default 0 check (held >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (type <> 'percent' or value between 1 and 100)
);
create unique index vouchers_event_code_idx on public.vouchers (event_id, lower(code));

create table public.orders (
  id bigint generated always as identity primary key,
  public_uuid uuid not null default gen_random_uuid() unique,
  invoice_code text not null unique,
  hold_id uuid not null unique references public.holds (id),
  event_id bigint not null references public.events (id),
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text not null,
  subtotal bigint not null,
  discount_amount bigint not null default 0,
  fee_amount bigint not null default 0,
  total bigint not null check (total >= 0),
  voucher_id bigint references public.vouchers (id),
  voucher_counted boolean not null default false,
  payment_method text not null,
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'paid', 'expired', 'cancelled', 'late_paid_review', 'refunded')),
  pay_expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_buyer_email_idx on public.orders (buyer_email);
create index orders_status_created_idx on public.orders (status, created_at);
create index orders_event_idx on public.orders (event_id);

create table public.order_answers (
  order_id bigint not null references public.orders (id),
  form_field_id bigint not null references public.form_fields (id),
  value jsonb,
  value_encrypted bytea,
  primary key (order_id, form_field_id)
);

create table public.consents (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders (id),
  policy_version text not null,
  purpose text not null,
  ip text,
  created_at timestamptz not null default now()
);
create index consents_order_idx on public.consents (order_id);

create table public.payments (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders (id),
  attempt int not null,
  midtrans_order_id text not null unique,
  payment_method text not null,
  snap_token text,
  redirect_url text,
  status text not null default 'pending',
  gross_amount bigint not null,
  expires_at timestamptz not null,
  raw_last jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, attempt)
);

create table public.payment_events (
  id bigint generated always as identity primary key,
  midtrans_order_id text not null,
  transaction_status text not null,
  transaction_id text,
  payload jsonb not null default '{}',
  received_at timestamptz not null default now(),
  unique nulls not distinct (midtrans_order_id, transaction_status, transaction_id)
);

create table public.admins (
  id bigint generated always as identity primary key,
  email text not null unique,
  password_hash text not null,
  totp_secret_enc bytea,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.tickets (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders (id),
  ticket_category_id bigint not null references public.ticket_categories (id),
  seq int not null,
  token text not null unique,
  status text not null default 'valid' check (status in ('valid', 'void')),
  checked_in_at timestamptz,
  checked_in_by bigint references public.admins (id),
  gate text,
  created_at timestamptz not null default now(),
  unique (order_id, seq)
);

create table public.checkin_events (
  id bigint generated always as identity primary key,
  ticket_id bigint references public.tickets (id),
  token text,
  admin_id bigint references public.admins (id),
  gate text,
  result text not null,
  created_at timestamptz not null default now()
);
create index checkin_events_created_idx on public.checkin_events (created_at);

create table public.jobs (
  id bigint generated always as identity primary key,
  type text not null,
  payload jsonb not null default '{}',
  dedupe_key text not null unique,
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  last_error text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_queued_idx on public.jobs (run_at) where status = 'queued';

create table public.settings (
  key text primary key,
  value jsonb not null default 'null',
  secret_enc bytea,
  updated_at timestamptz not null default now()
);

create table public.email_logs (
  id bigint generated always as identity primary key,
  order_id bigint references public.orders (id),
  type text not null,
  to_email text not null,
  message_id text,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  admin_id bigint references public.admins (id),
  action text not null,
  entity text not null,
  entity_id text,
  diff jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

insert into public.event_categories (name, slug, position) values
  ('Musik', 'music', 1),
  ('Pameran', 'exhibition', 2),
  ('Teater', 'theater', 3),
  ('Olahraga', 'sports', 4),
  ('Wisata', 'tourism', 5),
  ('Talkshow', 'talkshow', 6),
  ('Workshop', 'workshop', 7),
  ('Kompetisi', 'competition', 8);

insert into public.settings (key, value) values
  ('hold_minutes', '3'),
  ('pay_minutes', '15'),
  ('pay_grace_minutes', '5'),
  ('service_fee', '5000'),
  ('payment_methods',
   '{"qris":true,"va":{"bca":true,"bni":true,"bri":true,"mandiri":true,"permata":true,"cimb":true}}'),
  ('smtp', '{}'),
  ('site', '{"name":"Anytix","cs_whatsapp":"","cs_email":"","terms":"","privacy":"","privacy_updated_at":null}');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760, '{image/webp}')
on conflict (id) do nothing;

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
