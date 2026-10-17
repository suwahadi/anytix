# Fase 0 — Fondasi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js + worker repo connected to Supabase, with the whole PRD §19 schema, the atomic quota engine (PRD §10) proven against concurrency, admin auth with optional TOTP, and the WebP upload pipeline.

**Architecture:** One Next.js 16 app (App Router, `src/`), plus a `worker/` Node process run with `tsx` that reuses `src/lib`. All quota logic lives in plpgsql functions applied by numbered SQL migrations. Node talks to Postgres through postgres.js on the Supabase transaction pooler.

**Tech Stack:** Next.js 16.4, TypeScript, Tailwind CSS 4.3, postgres 3.4, zod 4, vitest 5, tsx 4, sharp 0.35.

**Spec:** `PRD.md` + `docs/superpowers/specs/2026-10-17-anytix-mvp-design.md` (the design doc wins on conflict).

## Global Constraints

- AGENTS.md: no annotation, tag-style, or divider comments. Keep JSDoc, keep one-line comments explaining non-obvious logic (lock order, workarounds).
- Commit messages: no `Co-Authored-By` or any Anthropic/Claude attribution. Author is the local git identity.
- Naming (PRD §5): tables plural snake_case, columns snake_case, files kebab-case, endpoints plural resources, technical names in English, UI text in Indonesian.
- Every plpgsql function: `security definer set search_path = ''`, every object schema-qualified (`public.`, `extensions.`), `execute` revoked from `public, anon, authenticated`.
- **Lock order rule:** any function that changes `public.ticket_inventory` first locks every inventory row it will touch with `public.lock_inventory(bigint[])` (ascending id, `for update`), and only then locks `holds`/`hold_items`/`vouchers`. `reclaim_expired` selects `hold_items` with `for update skip locked`. This prevents reserve/sweeper/webhook deadlocks.
- postgres.js: `prepare: false`, `max: 10` in the app, one `DATABASE_URL` (transaction pooler, port 6543).
- Hold statuses: `held | pending_payment | paid | released | expired`. Order statuses: `awaiting_payment | paid | expired | cancelled | late_paid_review | refunded`.
- Invariants checked by tests: `held(inv) = SUM(qty) hold_items WHERE counted`; `sold(inv) = SUM(qty) hold_items JOIN holds WHERE holds.status = 'paid'`; `sold + held <= capacity`.
- Settings defaults (PRD §6): `hold_minutes` 3 (1–30), `pay_minutes` 15 (5–1440), `pay_grace_minutes` 5, `service_fee` 5000, `payment_methods` `{"qris":true,"va":{"bca":true,"bni":true,"bri":true,"mandiri":true,"permata":true,"cimb":true}}`.
- Invoice code: prefix `A` + 8 chars of Crockford base32 (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`), uppercase, retried on collision. Midtrans order id: `{invoice}-{attempt}`.
- Ticket token: 16 random bytes, base64url without padding (22 chars), stored in `tickets.token` (design doc §3.1).
- DB integration tests run against the dev Supabase project, create their own event rows with a `test-` slug prefix, and delete them in `afterAll`.

## Review Focus

1. Two browser tabs of the same visitor press "Beli Sekarang" at once with different idempotency keys: one gets a hold and the other gets a clean "coba lagi" error, never a 500 and never two `held` holds (Task 5 test `concurrent reserve same visitor`).
2. The same request is retried with the same `Idempotency-Key` after the hold expired: it returns the original hold row, and its `expires_at` is in the past, so the UI shows "Waktu habis" instead of a fresh hold (Task 5 test `idempotent replay returns original hold`).
3. A sweeper run and many reserves on the same categories run together: no deadlock error surfaces (Task 7 test `sweeper concurrent with reserves`).
4. A late settlement arrives for an order whose items were partly reclaimed and partly still counted: it is all-or-nothing, and on failure the still-counted items are freed too (Task 7 test `late settlement partial reclaim`).
5. A voucher at its last use is applied by two checkouts at once: exactly one succeeds and the other gets `VOUCHER_UNAVAILABLE` (Task 6 test `voucher last use race`).

## File Structure

```
package.json, tsconfig.json, next.config.ts, vitest.config.ts, .env.example, .gitignore
db/migrations/0001_schema.sql        tables, constraints, indexes, RLS, extensions, storage bucket, settings seed, event_categories seed
db/migrations/0002_engine.sql        lock_inventory, reclaim_expired, release_hold_internal, reserve_tickets, release_hold
db/migrations/0003_checkout.sql      generate_invoice_code, quote_hold, checkout_hold
db/migrations/0004_payment.sql       issue_tickets, sell_hold_items, apply_payment_status, issue_late_order, sweep_expired_holds, reconcile_inventory, enqueue_job, pg_cron schedule
scripts/migrate.ts                   applies db/migrations/*.sql in order, records them in schema_migrations
scripts/create-admin.ts              npm run admin:create -- <email>
scripts/reset-2fa.ts                 npm run admin:reset-2fa -- <email>
src/lib/env.ts                       zod-parsed process.env
src/lib/db.ts                        postgres.js singleton `sql`
src/lib/crypto.ts                    encrypt/decrypt (AES-256-GCM), sign/verify (HMAC-SHA256), randomToken
src/lib/password.ts                  hashPassword / verifyPassword (scrypt)
src/lib/totp.ts                      generateTotpSecret / totpUri / verifyTotp
src/lib/admin-session.ts             session cookie create/read/clear, requireAdmin
src/lib/visitor.ts                   visitor cookie value create/verify
src/lib/settings.ts                  getSetting / getTransactionSettings
src/lib/image-service.ts             detectImageType / toWebpVariants
src/lib/storage.ts                   uploadObject → public URL
src/lib/jobs.ts                      enqueueJob / claimJobs / completeJob / failJob
src/lib/rate-limit.ts                in-memory fixed-window limiter
src/proxy.ts                         visitor cookie + /admin guard
src/app/admin/login/page.tsx         login form (email, password, TOTP step)
src/app/api/admin/auth/login/route.ts, logout/route.ts, 2fa/route.ts
src/app/api/admin/uploads/route.ts
worker/index.ts                      polling loop over claimJobs with handler map
tests/unit/*.test.ts, tests/db/*.test.ts, tests/db/helpers.ts
```

---

### Task 1: Scaffold the repo

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/lib/env.ts`
- Test: `tests/unit/env.test.ts`

**Interfaces:**
- Produces: `getEnv(): Env` (memoized zod parse of `process.env`; throws a readable error listing missing keys) and `parseEnv(source: Record<string, string | undefined>): Env` for tests.
  - Required keys: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`.
  - Keys with defaults: `MIDTRANS_IS_PRODUCTION` (bool, default false), `APP_URL` (default `http://localhost:3000`), `TURNSTILE_SITE_KEY` (default `1x00000000000000000000AA`), `TURNSTILE_SECRET_KEY` (default `1x0000000000000000000000000000000AA`).
  - Keys with format rules: `COOKIE_SECRET` (min 32 chars), `DATA_ENCRYPTION_KEY` (base64 of exactly 32 bytes).
  - Optional keys: `MIDTRANS_NOTIFICATION_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- Produces npm scripts: `dev`, `build`, `start`, `test` (vitest run tests/unit), `test:db` (vitest run tests/db), `db:migrate`, `admin:create`, `admin:reset-2fa`, `worker`. Scripts that need env use `tsx --env-file=.env.local`.

- [ ] **Step 1: Scaffold Next.js 16.4.2.** Run `npx create-next-app@16.4.2 <tmp> --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes` in a scratch folder, then move everything except `.git` into the repo root (which already holds `PRD.md`, `AGENTS.md`, `docs/`, `.claude/`).
  - Strip the boilerplate page down to a heading "Anytix".
  - Delete the sample SVGs in `public/`.
  - Set `<html lang="id">`.
- [ ] **Step 2: Install dependencies.** Run `npm i postgres zod` and `npm i -D vitest tsx @types/node`. In `vitest.config.ts`, map `@/` to `src/`, use the `node` environment, and add a setup file that calls `process.loadEnvFile('.env.local')` when that file exists.
- [ ] **Step 3: Write the failing test** `tests/unit/env.test.ts`:
  - `rejects short COOKIE_SECRET`: `parseEnv({...valid, COOKIE_SECRET: 'x'})` throws, and the message contains `COOKIE_SECRET`.
  - `applies Turnstile test keys by default`: `parseEnv(valid).TURNSTILE_SITE_KEY` equals `'1x00000000000000000000AA'`.
- [ ] **Step 4: Run** `npm test`. Expected: FAIL (module missing).
- [ ] **Step 5: Implement `src/lib/env.ts` and write `.env.example`.** `.env.example` lists every key with a one-line Indonesian hint. The `DATABASE_URL` hint says it is the transaction pooler on port 6543.
- [ ] **Step 6: Run** `npm test`. Expected: PASS. Then run `npm run build`. Expected: the build succeeds with no env set, because nothing calls `getEnv()` at import time.
- [ ] **Step 7: Create `.env.local`, but only if it does not exist yet.** Copy `.env.example`, set `COOKIE_SECRET` to `randomBytes(32).toString('base64url')` and `DATA_ENCRYPTION_KEY` to `randomBytes(32).toString('base64')`, and leave the owner's keys empty. `.gitignore` must contain `.env*`, `!.env.example`, and `.claude/settings.local.json`. Ask the owner to fill in the Supabase, Midtrans, and SMTP values. Task 2 cannot start until they do.
- [ ] **Step 8: Commit** everything, including `PRD.md`, `AGENTS.md`, and `docs/`: `chore: scaffold Next.js app`.

### Task 2: DB client, migration runner, schema

**Files:**
- Create: `src/lib/db.ts`, `scripts/migrate.ts`, `db/migrations/0001_schema.sql`, `tests/db/helpers.ts`
- Test: `tests/db/schema.test.ts`

**Interfaces:**
- Produces: `sql`, a postgres.js instance with `prepare: false`, `max: 10`, `idle_timeout: 20`. It is created once per process and stored on `globalThis` so it survives Next dev reloads.
- Produces test helpers in `tests/db/helpers.ts`:
  - `createTestEvent(opts?: { categories?: Array<{ name?: string; price?: number; capacity: number; maxPerOrder?: number; admitsPerUnit?: number }> }): Promise<{ eventId: number; sessionId: number; inventoryIds: number[]; categoryIds: number[] }>` creates a published event with slug `test-<random>` and `sale_status = 'on_sale'`, its default session with status `on_sale`, and `active` categories whose sale window runs from now−1h to now+1d.
  - `cleanupTestEvents(): Promise<void>` deletes every `test-%` event and its dependent rows.
  - `inventoryRow(id: number): Promise<{ capacity: number; sold: number; held: number }>`.
- Produces: the PRD §19 schema, with these deltas (design doc §3):
  - `tickets.token text unique not null` replaces `token_hash`. `checkin_events.token text` replaces `token_hash`.
  - Added columns: `jobs.locked_at timestamptz`, `settings.updated_at timestamptz`.
  - `email_logs` uses `to_email` instead of the reserved word `to`.
  - `holds.id` and `orders.public_uuid` default to `gen_random_uuid()`.
  - Money columns are `bigint`. `vouchers.max_uses` is a nullable int (null = unlimited). `orders.voucher_counted` defaults to false.
  - Status columns are `text` with `check (... in (...))`, using the value lists from Global Constraints plus these:
    - `events.status`: `draft|published|archived`
    - `events.sale_status` and `event_sessions.status`: `on_sale|paused|closed`
    - `ticket_categories.status`: `draft|active|hidden`
    - `form_fields.type`: the 9 types in PRD §14
    - `vouchers.type`: `percent|fixed`
    - `jobs.status`: `queued|running|done|failed`
    - `events.timezone`: `Asia/Jakarta|Asia/Makassar|Asia/Jayapura`
- The migration also does the following:
  - Creates `pgcrypto` in schema `extensions`.
  - Revokes all privileges on all tables and sequences in `public` from `anon` and `authenticated`, and runs `alter default privileges in schema public revoke execute on functions from public, anon, authenticated`.
  - Enables RLS on every table.
  - Inserts the public bucket `media` into `storage.buckets` (`on conflict do nothing`).
  - Seeds the 8 event categories from PRD §7 with positions 1–8.
  - Seeds `settings` with the Global Constraints defaults, plus `smtp` = `{}` and `site` = `{"name":"Anytix","cs_whatsapp":"","cs_email":"","terms":"","privacy":"","privacy_updated_at":null}`.

- [ ] **Step 1: Check that the Supabase project is empty.** Run `select table_name from information_schema.tables where table_schema='public'`. If it lists any table this plan does not create, stop and report to the owner.
- [ ] **Step 2: Write `scripts/migrate.ts`.**
  - If `schema_migrations(filename text primary key, applied_at timestamptz default now())` does not exist, create it.
  - For each `db/migrations/*.sql` not yet recorded, sorted by name, run `sql.begin(tx => tx.unsafe(fileText))` and record the file in the same transaction.
  - Print `applied <file>` for each file applied, or `up to date` if there was nothing to apply.
- [ ] **Step 3: Write the failing test** `tests/db/schema.test.ts`:
  - `all tables exist`: the public tables include all 21 names from PRD §19, plus `schema_migrations`.
  - `rls enabled on every public table`: `select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where nspname='public' and relkind='r' and not relrowsecurity` returns no rows.
  - `anon has no table access`: `has_table_privilege('anon','public.orders','select')` is false.
  - `settings defaults seeded`: `hold_minutes` 3, `pay_minutes` 15, `pay_grace_minutes` 5, `service_fee` 5000.
  - `event categories seeded`: the slugs in position order equal `['music','exhibition','theater','sports','tourism','talkshow','workshop','competition']`.
  - `inventory check blocks sold+held over capacity`: on a test event with capacity 1, `update ticket_inventory set held = 2` rejects with code `23514`.
  - `media bucket is public`: `select public from storage.buckets where id='media'` returns true.
- [ ] **Step 4: Run** `npm run test:db`. Expected: FAIL (tables missing).
- [ ] **Step 5: Write `db/migrations/0001_schema.sql` and run `npm run db:migrate`.** Copy the PRD §19 uniques and indexes exactly, including:
  - the partial unique index `holds (visitor_id, event_id) where status = 'held'`
  - `holds (expires_at) where status in ('held','pending_payment')`
  - `hold_items (inventory_id) where counted`
  - `jobs (run_at) where status = 'queued'`
  - `unique (event_id, lower(code))` on `vouchers`

  If the bucket insert fails with a permission error, take it out of the SQL, create the bucket in Task 9 through the Storage REST API instead, and note this in the commit message.
- [ ] **Step 6: Run** `npm run test:db`. Expected: PASS. Then run `npm run db:migrate` again. Expected output: `up to date`.
- [ ] **Step 7: Commit:** `feat(db): schema, RLS, seeds, migration runner`.

### Task 3: Crypto primitives

**Files:**
- Create: `src/lib/crypto.ts`, `src/lib/password.ts`, `src/lib/totp.ts`
- Test: `tests/unit/crypto.test.ts`, `tests/unit/password.test.ts`, `tests/unit/totp.test.ts`

**Interfaces:**
- Produces, in `crypto.ts`:
  - `encrypt(plain: string, key?: Buffer): Buffer`: AES-256-GCM, output laid out as `iv(12) | tag(16) | ciphertext`, key defaults to `DATA_ENCRYPTION_KEY`.
  - `decrypt(data: Buffer, key?: Buffer): string`: throws if the data was tampered with.
  - `sign(value: string, secret?: string): string`: returns `${value}.${base64url(HMAC-SHA256)}`; secret defaults to `COOKIE_SECRET`.
  - `verify(signed: string, secret?: string): string | null`: compares with `timingSafeEqual`; returns the value, or null if the signature is wrong.
  - `randomToken(bytes = 16): string`: base64url, no padding.
- Produces, in `password.ts`:
  - `hashPassword(pw: string): Promise<string>`: returns `scrypt$16384$8$1$<saltB64>$<hashB64>` with a 64-byte key.
  - `verifyPassword(pw: string, stored: string): Promise<boolean>`.
- Produces, in `totp.ts`:
  - `generateTotpSecret(): string`: 20 random bytes as RFC 4648 base32, no padding.
  - `totpCode(secret: string, timeMs: number): string`: SHA-1, 30 s step, 6 digits.
  - `verifyTotp(secret: string, code: string, timeMs = Date.now()): boolean`: accepts steps −1, 0 and +1.
  - `totpUri(secret: string, email: string, issuer: string): string`: an `otpauth://totp/` URI.

- [ ] **Step 1: Write the failing tests.**
  - `crypto.test.ts`:
    - `roundtrip`: `decrypt(encrypt('3201234567890001', k), k)` returns the same string.
    - `fresh iv`: two encryptions of the same text are different.
    - `tamper`: flipping the last byte makes `decrypt` throw.
    - `sign/verify`: with `s = 's'.repeat(32)`, `verify(sign('abc', s), s)` returns `'abc'`, and `verify('abc.bad', s)` returns `null`.
    - `randomToken`: `randomToken()` has length 22 and matches `/^[A-Za-z0-9_-]+$/`.
  - `password.test.ts`: `verifyPassword('rahasia123', await hashPassword('rahasia123'))` is true; the same check with `'salah'` is false; two hashes of the same password are different.
  - `totp.test.ts`, using the RFC 6238 SHA-1 vectors with secret `s = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'`:
    - `totpCode(s, 59_000)` is `'287082'`.
    - `totpCode(s, 1111111109_000)` is `'081804'`.
    - `verifyTotp(s, '287082', 89_000)` is true (one step of drift).
    - `verifyTotp(s, '287082', 149_000)` is false.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** the three files using only `node:crypto`. Base32 encode and decode are local helpers in `totp.ts`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(lib): encryption, signing, password hashing, TOTP`.

### Task 4: Settings reader, job queue, worker loop

**Files:**
- Create: `src/lib/settings.ts`, `src/lib/jobs.ts`, `worker/index.ts`
- Test: `tests/db/settings.test.ts`, `tests/db/jobs.test.ts`

**Interfaces:**
- Consumes: `sql` (Task 2).
- Produces, in `settings.ts`:
  - `getSetting<T>(key: string): Promise<T>`: reads `settings.value`, with no caching (PRD §6).
  - `getTransactionSettings(): Promise<{ holdMinutes: number; payMinutes: number; payGraceMinutes: number; serviceFee: number; paymentMethods: { qris: boolean; va: Record<string, boolean> } }>`.
- Produces, in `jobs.ts`, with `type Job = { id: number; type: string; payload: any; attempts: number }`:
  - `enqueueJob(type: string, payload: object, dedupeKey: string, runAt?: Date): Promise<boolean>`: inserts with `on conflict (dedupe_key) do nothing`; returns true if a row was inserted.
  - `claimJobs(limit: number): Promise<Job[]>`: one `update ... where id in (select id ... for update skip locked limit $n) returning *` that sets `status='running'`, `attempts=attempts+1` and `locked_at=now()`. It picks jobs that are `queued` with `run_at <= now()`, and also jobs still `running` with `locked_at < now() - interval '5 minutes'`, so jobs held by a crashed worker get picked up again.
  - `completeJob(id: number): Promise<void>`.
  - `failJob(job: Job, error: string): Promise<void>`: when `attempts >= 5`, the status becomes `failed`. Otherwise the status goes back to `queued`, `run_at` becomes `now() + 30s * 2^(attempts-1)`, and `last_error` is stored.
- Produces, in `worker/index.ts`: `runOnce(handlers: Record<string, (payload: any) => Promise<void>>, limit = 10): Promise<number>`.
  - A job whose type has no handler is failed with the error `no handler`.
  - When the file is run directly, it calls `runOnce` every 1 s and exits after the current batch on SIGINT or SIGTERM.
  - The handler map is `{}` in this phase.

- [ ] **Step 1: Write the failing tests.** Job tests use dedupe keys prefixed `test:` and delete them in `afterAll`.
  - `settings.test.ts`: `getTransactionSettings()` returns `{ holdMinutes: 3, payMinutes: 15, payGraceMinutes: 5, serviceFee: 5000 }` and `paymentMethods.qris === true`.
  - `jobs.test.ts`:
    - `enqueue dedupes by key`: a second `enqueueJob` with the same key returns false.
    - `claim is exclusive`: with one queued job, exactly one result of `Promise.all([claimJobs(1), claimJobs(1)])` contains it.
    - `retry then fail`: after the first failure, `run_at` is about 30 s ahead. Repeating claim + `failJob` 5 times (forcing `run_at = now()` before each claim) ends with status `failed`.
    - `runOnce runs handler and completes`: the handler receives the payload, and the job's status becomes `done`.
- [ ] **Step 2: Run** `npm run test:db`. Expected: FAIL.
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Run** `npm run test:db`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: settings reader, Postgres job queue, worker loop`.

### Task 5: Reserve and release engine

**Files:**
- Create: `db/migrations/0002_engine.sql`, `src/lib/db-errors.ts`, `src/lib/hold-service.ts`
- Test: `tests/db/reserve.test.ts`

**Interfaces:**
- Consumes: the schema and `createTestEvent`/`inventoryRow` (Task 2).
- Produces SQL functions:
  - `public.lock_inventory(p_ids bigint[]) returns void`: `perform 1 ... where id = any(p_ids) order by id for update`.
  - `public.reclaim_expired(p_inv bigint) returns int`: the PRD §10.2 body, except that `hold_items` rows are picked with `for update of hi skip locked` in a CTE before the update.
  - `public.release_hold_internal(p_hold uuid, p_status text) returns void`: frees each counted item, ordered by `inventory_id` (`held -= qty`, `counted = false`), then sets the hold status to `p_status`. The caller has already locked the inventory.
  - `public.reserve_tickets(p_visitor uuid, p_event_id bigint, p_items jsonb, p_idem text) returns public.holds`: the PRD §10.2 sketch, plus:
    - `p_items` must be a non-empty array of `{inventory_id, qty}` with no duplicate ids, every id belonging to the event's session. Anything else raises `INVALID_ITEMS`.
    - Before the old hold is released, `lock_inventory` locks the union of the old `held` hold's counted inventory ids and the new ids.
    - Per item, checked in this order:
      1. Category not `active`, or outside its sale window: `CATEGORY_NOT_ON_SALE:<inv>`.
      2. `qty > max_per_order`: `MAX_PER_ORDER:<inv>:<max>`.
      3. Not enough stock: `SOLD_OUT:<inv>:<available>`, with available computed after the reclaim.
  - `public.release_hold(p_hold uuid, p_visitor uuid) returns boolean`: locks inventory first. Returns true only if it released a `held` hold owned by that visitor.
  - Every exception uses `errcode = 'P0001'` with the colon-separated code as the message. The lock order gets a one-line SQL comment explaining it, because it is not obvious from the code.
- Produces, in `db-errors.ts`: `parseEngineError(e: unknown): { code: string; args: string[] } | null`. It returns null for any error that is not `P0001`.
- Produces, in `hold-service.ts`:
  - `class HoldError extends Error { code: string; inventoryId?: number; available?: number; max?: number }`.
  - `reserveTickets(input: { visitorId: string; eventId: number; items: Array<{ inventoryId: number; qty: number }>; idempotencyKey: string }): Promise<{ id: string; status: string; expiresAt: Date }>`. Engine errors are mapped to `HoldError`. On a unique violation (`23505`), it re-reads the hold by `(visitor_id, idempotency_key)` and returns it, or throws `HoldError('CONCURRENT')` if there is none.
  - `releaseHold(holdId: string, visitorId: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing tests** `tests/db/reserve.test.ts`. Each test creates its own event with `createTestEvent`, and `afterAll` calls `cleanupTestEvents`.
  - `reserves and counts held`: capacity 10, qty 2. `held` becomes 2, the status is `held`, and `expiresAt` is within ±10 s of now + 3 min.
  - `idempotent replay returns original hold`: two calls with the same key return the same id, and `held` stays 2. After forcing `expires_at = now() - 1 min`, a third call still returns that id, with `expiresAt < now`.
  - `rejects qty over max_per_order`: `maxPerOrder` 5 and qty 6 throws `HoldError` with code `MAX_PER_ORDER` and `max` 5.
  - `sold out reports available`: capacity 3. A reserves 2, then B asks for 2. B gets `SOLD_OUT` with `available` 1, and `held` is still 2.
  - `new hold replaces visitor's old held hold`: A reserves 2, then reserves 1 with a new key. The old hold is `released` and `held` is 1.
  - `pending_payment hold untouched by new reserve`: with A's first hold set to `pending_payment`, A reserves 1 more. The first hold stays `pending_payment`, and `held` = old + new.
  - `lazy reclaim frees expired holds`: capacity 2. A holds 2, and A's `expires_at` is forced into the past. B then reserves 2 successfully, A's items have `counted = false`, and `held` is 2.
  - `not on sale`: session status `paused` throws `NOT_ON_SALE`.
  - `release_hold frees slots`: `releaseHold` returns true, after which `held` is 0 and the status is `released`. The same call from another visitor returns false.
  - `300 reservers on capacity 100`: 300 distinct visitors each request qty 1 in parallel, through a dedicated `postgres(url, { prepare: false, max: 50 })` client.
    - Exactly 100 succeed and 200 throw `SOLD_OUT`.
    - Final `held` is 100, `sold + held <= capacity`, and `held` equals `SUM(qty) WHERE counted`.
  - `concurrent reserve same visitor`: one visitor fires 5 parallel reserves, each with a different key.
    - Each call either succeeds or throws `HoldError` with code `CONCURRENT`; no other error.
    - Exactly one `held` hold remains for that visitor and event, and `held` equals its qty.
  - `mixed category order does not deadlock`: two categories and 100 parallel reserves. Each visitor first holds one category, then replaces that hold with both categories, listed in random order.
    - No error with code `40P01`.
    - The invariant holds on both inventories.
- [ ] **Step 2: Run** `npm run test:db -- reserve`. Expected: FAIL.
- [ ] **Step 3: Implement.** Write `0002_engine.sql`, ending with an explicit `revoke execute on function ... from public, anon, authenticated` for each function, and run `npm run db:migrate`. Then implement `db-errors.ts` and `hold-service.ts`.
- [ ] **Step 4: Run** `npm run test:db -- reserve`. Expected: PASS on 3 consecutive runs. The concurrency tests must not be flaky.
- [ ] **Step 5: Commit:** `feat(engine): atomic reserve/release with lazy reclaim`.

### Task 6: Quote and checkout

**Files:**
- Create: `db/migrations/0003_checkout.sql`
- Modify: `tests/db/helpers.ts` (add `createTestVoucher`, `checkoutTestOrder`)
- Test: `tests/db/checkout.test.ts`

**Interfaces:**
- Consumes: `reserveTickets` (Task 5), `encrypt` (Task 3).
- Produces SQL functions:
  - `public.setting_int(p_key text) returns int`.
  - `public.enqueue_job(p_type text, p_payload jsonb, p_dedupe text, p_run_at timestamptz default now()) returns void`, using `on conflict (dedupe_key) do nothing`.
  - `public.generate_invoice_code() returns text`: `'A'` followed by 8 Crockford base32 characters from `extensions.gen_random_bytes(5)`.
  - `public.compute_quote(p_hold uuid, p_voucher_code text) returns jsonb`.
    - Returns `{items:[{inventory_id, ticket_category_id, name, qty, unit_price, line_total}], subtotal, discount, fee, total, voucher_id, voucher_code, voucher_error}`.
    - `voucher_error` is null or one of `NOT_FOUND | INACTIVE | NOT_STARTED | ENDED | NOT_APPLICABLE | MIN_QTY | MIN_SUBTOTAL | EXHAUSTED`. Any error gives `discount = 0` and `voucher_id = null`.
    - The code is matched case-insensitively on `lower(code)` within the hold's event.
    - The discount base, `min_qty` and `min_subtotal` count only eligible items. All items are eligible when `ticket_category_ids` is null or empty.
    - A `percent` voucher gives `floor(base * value / 100)`, capped by `max_discount`. A `fixed` voucher gives `value`. The discount is then capped at `least(base, subtotal - 1000)`.
    - `fee` is the `service_fee` setting.
    - `EXHAUSTED` means `max_uses is not null and used + held >= max_uses`.
  - `public.quote_hold(p_hold uuid, p_visitor uuid, p_voucher_code text) returns jsonb` raises `HOLD_NOT_FOUND` if the hold is missing or owned by another visitor, raises `HOLD_EXPIRED` if it is not `held` or has expired, and otherwise returns `compute_quote`.
  - `public.checkout_hold(p_hold uuid, p_visitor uuid, p_buyer jsonb, p_answers jsonb, p_payment_method text, p_voucher_code text, p_consents jsonb) returns public.orders`. It is idempotent per hold, so it takes no idempotency-key parameter. It runs these steps in order:
    1. Run the PRD §10.3 `UPDATE holds ... status='pending_payment', expires_at = now() + pay_minutes + pay_grace_minutes`. If it updates 0 rows, return the existing order for this hold and visitor if one exists. Otherwise raise `HOLD_EXPIRED` if the hold belongs to this visitor, else `HOLD_NOT_FOUND`.
    2. Raise `INVALID_BUYER` if `name`, `email` or `phone` in `p_buyer` is empty.
    3. Run `compute_quote`. If a voucher code was given and `voucher_error` is set, raise `VOUCHER_INVALID:<err>`.
    4. Hold the voucher with `update vouchers set held = held + 1 where id = $v and active and (max_uses is null or used + held < max_uses)`. If no row is updated, raise `VOUCHER_UNAVAILABLE`.
    5. Insert the order with `status 'awaiting_payment'`, `pay_expires_at = now() + pay_minutes`, `fee_amount` from the quote, and `voucher_counted = (voucher_id is not null)`. Retry with a new code on an `invoice_code` unique violation.
    6. Insert `order_answers` from `p_answers` (`[{form_field_id, value, value_encrypted}]`). `value_encrypted` is base64 and is decoded to bytea.
    7. Insert a `payments` row: `attempt 1`, `midtrans_order_id = invoice || '-1'`, `status 'pending'`, `gross_amount = total`, `expires_at = pay_expires_at`.
    8. Insert one `consents` row for each entry in `p_consents` (`[{policy_version, purpose, ip}]`).
    9. Call `enqueue_job('email', {type:'awaiting_payment', order_id}, 'email:awaiting_payment:' || order_id)`.
- Produces test helpers:
  - `createTestVoucher(eventId, fields: Partial<{ code: string; type: 'percent' | 'fixed'; value: number; maxDiscount: number; minQty: number; minSubtotal: number; ticketCategoryIds: number[]; maxUses: number; active: boolean; validFrom: Date; validTo: Date }>): Promise<number>`.
  - `checkoutTestOrder(opts: { eventId: number; items: Array<{ inventoryId: number; qty: number }>; voucherCode?: string; visitorId?: string }): Promise<{ holdId: string; orderId: number; midtransOrderId: string; visitorId: string }>`.

- [ ] **Step 1: Write the failing tests** `tests/db/checkout.test.ts`. Ticket price is Rp100.000 unless stated otherwise.
  - `quote without voucher`: 2 tickets give `subtotal 200000, discount 0, fee 5000, total 205000`.
  - `percent voucher with max_discount`: 10% with `max_discount` 15000 gives `discount 15000`.
  - `fixed voucher keeps tickets >= 1000`: fixed 250000 on a 200000 subtotal gives `discount 199000` and `total 6000`.
  - `category-scoped voucher`: category A at 100000 ×1 and B at 50000 ×2.
    - A 50% voucher limited to B gives `discount 50000`.
    - The same voucher with `min_qty 3` gives `voucher_error 'MIN_QTY'`.
  - `voucher errors and case-insensitive code`:
    - An unknown code gives `NOT_FOUND`.
    - `active=false` gives `INACTIVE`.
    - `valid_to` in the past gives `ENDED`.
    - `'hemat10'` matches `'HEMAT10'`.
  - `checkout creates order, payment, consents, job`:
    - The order status is `awaiting_payment` and the invoice matches `/^A[0-9A-HJKMNP-TV-Z]{8}$/`.
    - `payments.midtrans_order_id` is the invoice followed by `'-1'`.
    - The hold is `pending_payment`, with `expires_at` about now+20 min and `pay_expires_at` about now+15 min (±10 s).
    - `fee_amount` is 5000.
    - There are 2 consents.
    - A job `email:awaiting_payment:<id>` is queued.
  - `checkout is idempotent`: the second call returns the same order id, and there is still only one payments row.
  - `checkout on expired or foreign hold`: a hold with `expires_at` in the past gives `HOLD_EXPIRED`; another visitor's hold gives `HOLD_NOT_FOUND`.
  - `voucher last use race`: a voucher with `max_uses 1`, and two visitors whose holds check out in parallel with it.
    - Exactly one checkout succeeds; the other throws `VOUCHER_UNAVAILABLE`.
    - The losing hold is still `held`.
    - The voucher has `held = 1`.
  - `identity answer stored encrypted`: `value_encrypted` gives back `'3201234567890001'` after `decrypt`.
- [ ] **Step 2: Run** `npm run test:db -- checkout`. Expected: FAIL.
- [ ] **Step 3: Write** `0003_checkout.sql` (with the `revoke execute` lines), then run `npm run db:migrate`.
- [ ] **Step 4: Run** `npm run test:db -- checkout`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(engine): quote and checkout with voucher hold`.

### Task 7: Payment status, tickets, sweeper, reconciliation

**Files:**
- Create: `db/migrations/0004_payment.sql`
- Test: `tests/db/payment.test.ts`, `tests/db/sweeper.test.ts`

**Interfaces:**
- Consumes: `checkoutTestOrder`, `createTestVoucher` (Task 6), `lock_inventory`, `release_hold_internal` (Task 5), `enqueue_job` (Task 6).
- Produces SQL functions:
  - `public.issue_tickets(p_order bigint) returns int`:
    - Inserts `admits_per_unit × qty` tickets per item.
    - `seq` runs 1..N across the whole order.
    - Each token is `translate(encode(extensions.gen_random_bytes(16),'base64'),'+/=','-_')`.
    - Returns 0 without inserting if the order already has tickets.
  - `public.sell_hold_items(p_hold uuid) returns boolean`. The caller has already locked inventory. Inside a `begin ... exception when sqlstate 'AX001'` block, it handles each item ordered by `inventory_id`:
    - Counted item: move `held → sold` and set `counted = false`.
    - Uncounted item: `update ... set sold = sold + qty where capacity - sold - held >= qty`. If no row is updated, `raise ... using errcode = 'AX001'`.
    - Returns false when the block is rolled back, otherwise true.
  - `public.apply_payment_status(p_midtrans_order_id text, p_status text, p_payload jsonb) returns jsonb`. Returns `{found, order_id, public_uuid, status, changed}`. Steps:
    1. Insert into `payment_events` with `on conflict do nothing`. `transaction_id` is taken from `p_payload->>'transaction_id'`.
    2. Find the payment. If there is none, return `{found:false}`.
    3. Call `lock_inventory` on the hold's item inventory ids, then lock the order row and update the payment's `status` and `raw_last`.
    4. If `settlement` and the order is `awaiting_payment|expired|cancelled`, call `sell_hold_items`.
       - When it returns true:
         - The hold becomes `paid`.
         - The order becomes `paid` and gets `paid_at`.
         - When there is a voucher, the voucher gets `used += 1` and `held -= 1` if `voucher_counted`, and `voucher_counted` becomes false.
         - Then `issue_tickets` runs and job `email:paid:<id>` is queued.
       - When it returns false:
         - `release_hold_internal(hold,'expired')` runs.
         - The order becomes `late_paid_review`.
         - The voucher gets `held -= 1` if `voucher_counted`.
         - Jobs `email:late_paid:<id>` and `admin-alert:late_paid:<id>` are queued; the second has type `admin-alert`.
    5. If `expire|deny|failure|cancel` and the order is `awaiting_payment`:
       - If the hold is `pending_payment`, call `release_hold_internal(hold,'released')`.
       - Release the voucher.
       - The order becomes `cancelled` for `cancel`, otherwise `expired`.
       - Queue `email:expired:<id>` only when the order became `expired`.
    6. Any other status or combination only updates the payment row and returns `changed:false`.
  - `public.issue_late_order(p_order bigint) returns public.orders`. The order must be `late_paid_review`, otherwise it raises `INVALID_STATE`. It locks inventory and calls `sell_hold_items`. On false it raises `SOLD_OUT`. On true it applies the same paid transition as above, with voucher `used += 1`.
  - `public.sweep_expired_holds() returns int`:
    1. Without locks, select up to 1,000 candidate holds `in ('held','pending_payment') and expires_at < now()`, ordered by `expires_at`.
    2. `lock_inventory` their counted items' inventory ids.
    3. Re-select the candidates `for update skip locked`.
    4. Call `release_hold_internal(id,'expired')` on each.
    5. For each former `pending_payment` hold, release its order's voucher if `voucher_counted`, and `enqueue_job('payment-check', {order_id}, 'payment-check:' || order_id)`.
    6. Return the number of holds processed.
  - `public.reconcile_inventory(p_fix boolean default false) returns table(inventory_id bigint, held_actual int, held_expected int, sold_actual int, sold_expected int)`:
    - Returns only rows that drift. `held_expected = SUM(qty) WHERE counted`. `sold_expected = SUM(qty)` of items whose hold is `paid`.
    - When `p_fix` is true, it locks the drifting rows, then sets them to the expected values.
  - pg_cron:
    - `create extension if not exists pg_cron`.
    - `cron.schedule('sweep-expired-holds', '15 seconds', 'select public.sweep_expired_holds()')`.
    - If the pooler rejects the extension, enable pg_cron from the Supabase dashboard (Database → Extensions), rerun the migration, and tell the owner.

- [ ] **Step 1: Write the failing tests** `tests/db/payment.test.ts`:
  - `settlement moves held to sold and issues tickets`: one Bundle item (admits 2) ×1 plus a regular item ×2.
    - The order is `paid`.
    - `sold` goes up by 1 and 2 respectively, and `held` is 0.
    - There are 4 tickets with seq 1–4 and unique 22-char tokens.
    - The job `email:paid:<id>` exists.
  - `duplicate settlement is a no-op`: on the second call, `changed` is false, there are still 4 tickets, and `sold` is unchanged.
  - `expire releases slots`: `held` is 0, the order is `expired`, the hold is `released`, and the job `email:expired:<id>` exists.
  - `expire after settlement is a no-op`: the order stays `paid`.
  - `late settlement with quota honored`: force the hold's `expires_at` into the past and run `sweep_expired_holds()`. A settlement after that makes the order `paid` with `held` 0, and `sold` goes up.
  - `late settlement without quota goes to review`: capacity 1.
    - A's hold expires and is swept.
    - B reserves the slot and pays.
    - A's settlement makes A's order `late_paid_review`, with `sold` = 1 and the jobs `email:late_paid` and `admin-alert:late_paid`.
  - `late settlement partial reclaim`: A's order has category X ×1 and Y ×1, and each category has capacity 1.
    - A's `expires_at` is forced into the past.
    - B reserves X, which lazily reclaims only X.
    - A's settlement makes A's order `late_paid_review`; Y's `held` is 0 and its `sold` is 0. The invariant holds on both.
  - `voucher confirmed on settlement`: the voucher ends with `used 1` and `held 0`.
  - `late payment honors voucher beyond max_uses`: `max_uses 1`.
    - A checks out with the voucher, then expires and is swept.
    - B uses the voucher and pays.
    - A's late settlement with quota makes A's order `paid`, and the voucher's `used` becomes 2.
  - `issue_late_order needs capacity`: starting from `late_paid_review`, `issue_late_order` throws `SOLD_OUT`. After `capacity += 1` it succeeds: the order is `paid` and the tickets are issued.
  - `unknown order`: `apply_payment_status('NOPE-1','settlement','{}')` returns `found false`.
  - `functions not executable by anon`: `has_function_privilege('anon', '<sig>', 'execute')` is false for `reserve_tickets`, `checkout_hold`, `apply_payment_status`, and `sweep_expired_holds`.
- [ ] **Step 2: Write the failing tests** `tests/db/sweeper.test.ts`:
  - `sweeper expires held and pending holds`:
    - A `held` hold past expiry becomes `expired`.
    - A `pending_payment` hold past expiry becomes `expired`, its voucher's `held` is released, and the job `payment-check:<order_id>` exists.
    - The order stays `awaiting_payment`.
  - `sweeper concurrent with reserves`: 50 expired holds on 2 categories; `sweep_expired_holds()` runs in parallel with 100 reserves.
    - No error has code `40P01`.
    - Afterwards `reconcile_inventory()` returns no rows for these inventories.
  - `reconcile detects and fixes drift`:
    - After `held += 1` is injected, `reconcile_inventory()` reports that row.
    - `reconcile_inventory(true)` fixes it.
    - A second call returns nothing.
  - `cron job scheduled`: `select schedule from cron.job where jobname='sweep-expired-holds'` returns `'15 seconds'`.
- [ ] **Step 3: Run** `npm run test:db -- payment sweeper`. Expected: FAIL.
- [ ] **Step 4: Write** `0004_payment.sql` (with the revokes) and run `npm run db:migrate`.
- [ ] **Step 5: Run** the full `npm run test:db`. Expected: all PASS. Keep pg_cron in mind: tests that force `expires_at` must call the sweeper themselves, and their assertions must still hold if cron sweeps first. Assert final states, not who did the sweeping.
- [ ] **Step 6: Commit:** `feat(engine): payment status, ticket issuance, sweeper, reconciliation`.

### Task 8: Admin auth, visitor cookie, proxy

**Files:**
- Create: `src/lib/admin-service.ts`, `src/lib/admin-session.ts`, `src/lib/visitor.ts`, `src/lib/rate-limit.ts`, `src/proxy.ts`, `src/app/api/admin/auth/login/route.ts`, `src/app/api/admin/auth/logout/route.ts`, `src/app/api/admin/auth/2fa/route.ts`, `src/app/api/admin/auth/2fa/setup/route.ts`, `src/app/admin/login/page.tsx`, `src/app/admin/login/login-form.tsx`, `src/app/admin/page.tsx`, `src/app/admin/security/page.tsx`, `scripts/create-admin.ts`, `scripts/reset-2fa.ts`
- Test: `tests/unit/session.test.ts`, `tests/unit/rate-limit.test.ts`, `tests/db/admin-auth.test.ts`

**Interfaces:**
- Consumes: `sign`/`verify`/`encrypt`/`decrypt` (Task 3), `hashPassword`/`verifyPassword`, TOTP functions (Task 3), `sql`.
- Produces, in `admin-service.ts`:
  - `createAdmin(email: string, password: string): Promise<number>`. The email is lowercased and the password must be at least 10 characters.
  - `findAdminByEmail(email)`, `getActiveAdmin(id: number)`.
  - `setTotpSecret(adminId: number, secret: string | null): Promise<void>`. The secret is stored encrypted, and null disables 2FA.
  - `getTotpSecret(adminId): Promise<string | null>`.
- Produces, in `admin-session.ts`:
  - Cookie names: `ADMIN_COOKIE = 'admin_session'` (12 h), `ADMIN_2FA_COOKIE = 'admin_2fa'` (5 min).
  - `createSessionValue(adminId: number, now = Date.now(), ttlMs): string` signs `"<id>.<expMs>"`.
  - `readSessionValue(value: string | undefined, now = Date.now()): number | null`.
  - `requireAdmin(req: NextRequest): Promise<{ id: number; email: string } | null>` verifies the cookie, then checks `is_active` in the DB.
  - `cookieOptions(maxAgeSec: number)`: HttpOnly, SameSite=Lax, path `/`, and Secure when `APP_URL` starts with `https`.
- Produces, in `visitor.ts`:
  - `VISITOR_COOKIE = 'vid'`.
  - `newVisitorCookie(): { id: string; value: string }` creates a UUID v4 and signs it.
  - `readVisitorId(value?: string): string | null`.
- Produces, in `rate-limit.ts`: `rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean`, a fixed window over a `Map` that drops expired entries as it goes. Add the comment `shortcut: per-process memory, only correct for a single instance; move to Postgres or Cloudflare when scaling horizontally`.
- Route handlers take only `NextRequest`, read cookies from `req.cookies`, and set them on the returned `NextResponse`. They never use `next/headers`, which keeps them testable as plain functions.
  - `POST /api/admin/auth/login` with `{email, password}`:
    - Rate limit is 5 per minute per `ip|email`; over the limit returns 429 `{error:'Terlalu banyak percobaan. Coba lagi sebentar lagi.'}`.
    - Bad credentials or an inactive admin return 401 `{error:'Email atau kata sandi salah.'}`.
    - With 2FA enabled: 200 `{next:'2fa'}`, plus the `admin_2fa` cookie. Otherwise: 200 `{next:'done'}`, plus `admin_session`.
  - `POST /api/admin/auth/2fa` with `{code}` and the `admin_2fa` cookie: a valid code returns 200 `{next:'done'}`, sets `admin_session`, and clears `admin_2fa`. A wrong code returns 401. Rate limit is 5 per minute.
  - `GET /api/admin/auth/2fa/setup` (session required) returns `{secret, uri, qr}`, where `qr` is a data URL from `qrcode`.
  - `POST /api/admin/auth/2fa/setup` with `{secret, code}` enables 2FA. `DELETE` with `{code}` disables it.
  - `POST /api/admin/auth/logout` clears `admin_session`.
- `src/proxy.ts` does three things:
  1. If `vid` is missing or invalid, it sets a new one: max-age 1 year, HttpOnly, SameSite=Lax. It also injects the cookie into the forwarded request headers, so server code sees it on the same request.
  2. For `/admin/*` except `/admin/login`, it redirects to `/admin/login` unless `readSessionValue` passes.
  3. For `/api/admin/*` except `auth/login` and `auth/2fa`, it returns 401 JSON `{error:'Sesi berakhir. Silakan masuk lagi.'}` unless `readSessionValue` passes.

  The matcher excludes `_next/static`, `_next/image`, and files with an extension.
- CLI:
  - `npm run admin:create -- <email>` asks for the password twice on stdin with no echo.
  - `npm run admin:reset-2fa -- <email>` sets the TOTP secret to null.
- UI:
  - `/admin/login`: email and password, then a 6-digit code step when 2FA is on.
  - `/admin`: a placeholder dasbor showing the admin's email, a "Keamanan" link, and "Keluar".
  - `/admin/security`: a QR code to scan, a code input, and enable/disable 2FA.

- [ ] **Step 1: Load the antislop skills** `antislop:antislop`, `antislop:antislop-ui`, and `antislop:antislop-copywriting` before writing any UI. The owner chose to apply them during the work.
- [ ] **Step 2: Write the failing unit tests:**
  - `session.test.ts`:
    - `roundtrip`: `readSessionValue(createSessionValue(7, t, 12h), t + 1h)` is 7.
    - `expired`: the same value read at `t + 13h` is null.
    - `tampered`: changing the id to 8 gives null.
    - `visitor roundtrip`: `readVisitorId(newVisitorCookie().value)` returns the id, and `readVisitorId('abc.def')` is null.
  - `rate-limit.test.ts`: 5 calls are allowed and the 6th is blocked; the same key is allowed again after `windowMs`.
- [ ] **Step 3: Write the failing DB test** `tests/db/admin-auth.test.ts`. It creates an admin `test-admin-<rand>@example.com` and deletes it in `afterAll`. The routes are called with `new NextRequest('http://localhost/api/...', { method:'POST', body, headers })`.
  - `login without 2fa sets session`: returns 200 `{next:'done'}`, and `set-cookie` contains `admin_session=`.
  - `wrong password`: returns 401.
  - `rate limited after 5 attempts`: the 6th attempt returns 429.
  - `login with 2fa needs code`:
    - Login returns `{next:'2fa'}` and sets `admin_2fa`.
    - The 2fa route with `totpCode(secret, Date.now())` returns 200 and sets `admin_session`.
    - A wrong code returns 401.
  - `inactive admin rejected`: returns 401.
- [ ] **Step 4: Run** `npm test` and `npm run test:db -- admin-auth`. Expected: FAIL.
- [ ] **Step 5: Implement** the files above, with `npm i qrcode` and `npm i -D @types/qrcode`.
- [ ] **Step 6: Run** both test commands. Expected: PASS.
- [ ] **Step 7: Verify in the browser.**
  - Run `npm run dev`, then create an admin with `npm run admin:create`.
  - Using Playwright, check that `/admin` redirects to `/admin/login`, that login reaches the dasbor, that enabling 2FA in `/admin/security` makes the next login ask for a code, and that "Keluar" logs out.
  - Check that the `vid` cookie is set on the first visit to `/`.
  - Take screenshots in light and dark mode at 375 px and 1280 px width.
- [ ] **Step 8: Commit:** `feat(auth): admin login with optional TOTP, visitor cookie, proxy guard`.

### Task 9: WebP upload pipeline

**Files:**
- Create: `src/lib/image-service.ts`, `src/lib/storage.ts`, `src/app/api/admin/uploads/route.ts`
- Test: `tests/unit/image-service.test.ts`, `tests/db/upload.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (Task 8), `randomToken` (Task 3), `getEnv` (Task 1).
- Produces, in `image-service.ts`:
  - `detectImageType(buf: Buffer): 'jpeg' | 'png' | 'webp' | 'gif' | 'avif' | null`, by magic bytes.
  - `toWebpVariants(buf: Buffer): Promise<{ lg: Buffer; md: Buffer; thumb: Buffer }>`. Each variant is `sharp(buf).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 80 })`, with widths lg 1600, md 800, thumb 400.
- Produces, in `storage.ts`:
  - `uploadObject(path: string, body: Buffer, contentType: string): Promise<void>` sends `POST {SUPABASE_URL}/storage/v1/object/media/{path}` with the service role key in `Authorization` and `apikey`, plus `cache-control: 31536000`.
  - `deleteObjects(paths: string[]): Promise<void>`.
  - `mediaUrl(base: string, size: 'lg' | 'md' | 'thumb'): string` returns `{SUPABASE_URL}/storage/v1/object/public/media/{base}-{size}.webp`.
  - `ensureMediaBucket(): Promise<void>` is only needed if Task 2 could not create the bucket through SQL.
- Produces `POST /api/admin/uploads`, a multipart request with `file` and `kind` (`poster|logo|icon`):
  - The order of checks:
    1. Not an admin: 401.
    2. `file.size > 10 * 1024 * 1024`: 413 `{error:'Ukuran file maksimal 10 MB.'}`. This check runs before the body is read into memory.
    3. Magic bytes not an image: 415 `{error:'Format harus JPG, PNG, WebP, GIF, atau AVIF.'}`.
  - On success, it uploads the 3 variants under `base = {kind}/{yyyy}/{randomToken(9)}` and returns 200 `{ base, urls: { lg, md, thumb } }`. The DB stores `base`; pages build the `srcset` from it.

- [ ] **Step 1: Install** `npm i sharp`. Add `sharp` to `serverExternalPackages` in `next.config.ts` if the build complains.
- [ ] **Step 2: Write the failing unit tests** `image-service.test.ts`. Generate test images with `sharp({ create: ... })`.
  - `detects types`: a PNG is detected as `'png'` and a JPEG as `'jpeg'`; `Buffer.from('hello')` gives `null`.
  - `does not enlarge`: the variant widths of a 500×300 PNG are lg 500, md 500, and thumb 400.
  - `outputs webp`: `detectImageType(variants.lg)` returns `'webp'`.
- [ ] **Step 3: Write the failing DB test** `upload.test.ts`, with a test admin session cookie made by `createSessionValue`:
  - `uploads three webp variants`: returns 200, and `fetch(urls.thumb)` gives 200 with `content-type` `image/webp`. `afterAll` deletes the objects.
  - `rejects big file`: an 11 MB buffer returns 413.
  - `rejects non-image`: returns 415.
  - `requires admin`: a request without a cookie returns 401.
- [ ] **Step 4: Run** `npm test` and `npm run test:db -- upload`. Expected: FAIL.
- [ ] **Step 5: Implement** the three files.
- [ ] **Step 6: Run** both. Expected: PASS.
- [ ] **Step 7: Commit:** `feat(media): WebP upload pipeline to Supabase Storage`.

### Task 10: Fase 0 checkpoint

- [ ] **Step 1: Run everything.** `npm test`, `npm run test:db`, `npm run lint`, and `npm run build` must all pass. Then start `npm run worker` and confirm it starts and stops cleanly on Ctrl+C.
- [ ] **Step 2: Check comments (AGENTS.md).** Run `git grep -nE "//\s*(TODO|NOTE|FIX)|// ?[=-]{4,}|\{/\*"` on the tracked files. It must find nothing. The lock-order comments and the `shortcut:` comment stay.
- [ ] **Step 3: Push.** Run `git push -u origin main`. No commit may contain an attribution trailer; check with `git log --format=%B | grep -i co-authored`, which must print nothing.
- [ ] **Step 4: Report to the owner** in Indonesian:
  - what can be tried now: admin login and 2FA, `npm run test:db` showing the 300-vs-100 concurrency test
  - what was verified, and anything deviating from this plan
  - what Fase 1 will contain

  Then stop and wait for approval. The Fase 1 plan is written after that.
