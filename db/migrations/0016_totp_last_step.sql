-- Last accepted 2FA time step per admin; login refuses a code from the same or an earlier step.
alter table public.admins add column if not exists totp_last_step bigint;
