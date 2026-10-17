alter table public.events add column is_featured boolean not null default false;
create index events_status_starts_idx on public.events (status, starts_at);
