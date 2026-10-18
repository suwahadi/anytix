# Fase 4 — Peluncuran Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anytix runs in production at `https://anytix.web.id` on a Singapore VPS managed with aaPanel, takes real Midtrans payments, sends authenticated email from the domain, survives a k6 load test, can be backed up and restored, and has a runbook the owner can follow on a pilot event day.

**Architecture:** No new product features. The repo gains production plumbing:
- safety guards for the database that dev and production now share;
- a proxy-aware client IP;
- a health endpoint;
- a preflight checker;
- PM2/Nginx/deploy files for aaPanel;
- a backup script;
- a Midtrans method checker;
- an Indonesian runbook.

The owner performs every dashboard, DNS and server action; the agent prepares files, scripts and step lists and verifies what can be verified locally.

**Tech Stack:** Next.js 16.4 (`next start`), Node 22, PM2 (via aaPanel "Node project"), Nginx (aaPanel website + Let's Encrypt), optional Cloudflare proxy, Supabase Postgres (existing project), Midtrans production, Brevo, k6, `pg_dump`.

**Spec:** `PRD.md` §5, §18, §21, §22, §23 (row "4. Peluncuran") + `docs/superpowers/specs/2026-10-17-anytix-mvp-design.md`. Read `docs/superpowers/HANDOFF.md` first.

## Owner decisions (18 Oktober 2026)

| Topik | Keputusan |
|---|---|
| Domain | `anytix.web.id` (APP_URL `https://anytix.web.id`, email pengirim `no-reply@anytix.web.id`) |
| Hosting | VPS Singapura dengan aaPanel |
| Database | Project Supabase yang sekarang (dev) dipakai juga untuk produksi |
| Eksekusi | Agent menyiapkan file dan langkah; pemilik menjalankan langkah server, DNS dan dashboard |

## Global Constraints

- **Rules carried over:** everything in the Fase 0–3 Global Constraints still applies:
  - AGENTS.md comment rules;
  - no AI attribution in commits;
  - Indonesian UI and reports, English code;
  - `cursor: pointer`;
  - antislop during the work.
- **Shared database:** after go-live the Supabase project holds real orders and PII.
  - No agent or test may write to it without the explicit opt-in from Task 1.
  - `npm run test:db`, migrations and ad hoc scripts must be refused there unless that opt-in is set.
- **Secrets:** never committed, never printed. Templates contain names and comments only.
- **Production values:**
  - `APP_URL=https://anytix.web.id`.
  - `MIDTRANS_IS_PRODUCTION=true`.
  - Real Turnstile keys, since the hostname check then applies.
  - `SMTP_FROM="AnyTix <no-reply@anytix.web.id>"`.
- **Single instance:** one web process (rate limits and `singleFlight` are in memory) and one worker process.
- **Port 3000 is private:** the app listens on `127.0.0.1:3000` only, and Nginx is the only public entry.
- **Owner-run steps:** every owner-run step is written as an Indonesian checklist with the exact menu path, value and a way to confirm it worked.

## Review Focus

1. **A client sends a forged `X-Forwarded-For` or `CF-Connecting-IP` to dodge the per-IP limits.**
   - Expected: behind Nginx the app uses the address Nginx saw.
   - Test: Task 2 `forged forwarding headers are ignored behind the proxy`.
2. **A developer runs `npm run test:db` on a laptop whose `.env.local` points at the production database.**
   - Expected: the run stops before any test writes a row.
   - Test: Task 1 `db tests refuse without opt-in`.
3. **The worker dies silently on the VPS.**
   - Expected: `/api/health` reports 503 once queued jobs are older than 5 minutes, so the uptime monitor alerts.
   - Test: Task 3 `stale queue is unhealthy`.
4. **Production goes live while `admin@admin.com` is still active, while Turnstile still uses test keys, or with `MIDTRANS_IS_PRODUCTION` false.**
   - Expected: preflight fails with a named reason.
   - Test: Task 5 `preflight names every blocking problem`.
5. **The k6 hold rush runs from one machine.**
   - Expected: the per-IP limits can be raised for the run through one env value and return to normal without a code change.
   - Test: Task 2 `rate limit scale multiplies per-IP limits`.

## File Structure

```
tests/db-guard.ts                          refuses DB tests unless DB_TESTS_ALLOWED=true (vitest setup for tests/db)
scripts/guard.ts                           same refusal for scripts/migrate.ts, apply-sql.ts, create-admin.ts, reset-2fa.ts (opt-in DB_WRITE_ALLOWED)
scripts/reset-dev-data.ts                  dry-run by default; --apply deletes dev/test orders, holds, jobs, logs, check-ins
src/lib/rate-limit.ts                      clientIp prefers X-Real-IP; RATE_LIMIT_SCALE
src/app/api/health/route.ts                GET: db ping + oldest queued job age
src/lib/preflight.ts                       pure checks over a snapshot
scripts/preflight.ts                       loads the snapshot from env + DB, prints PASS/FAIL, exit 1 on any FAIL
scripts/check-midtrans.ts                  one Snap transaction per payment method (Rp10.000, 5 min), prints which work
deploy/ecosystem.config.cjs                PM2: anytix-web (next start -H 127.0.0.1 -p 3000), anytix-worker
deploy/nginx-anytix.conf                   aaPanel site snippet: proxy, X-Real-IP, Cloudflare real_ip, body size, headers
deploy/deploy.sh                           pull, npm ci, migrate (with DB_WRITE_ALLOWED), build, pm2 reload
deploy/backup-db.sh                        pg_dump -Fc, 14-day retention
.env.production.example                    production variable names with Indonesian comments
docs/runbook.md                            Indonesian runbook
```

---

### Task 1: Guard the shared database

**Files:**
- Create: `tests/db-guard.ts`, `scripts/guard.ts`, `scripts/reset-dev-data.ts`
- Modify: `vitest` config for the `tests/db` project (setupFiles), `scripts/migrate.ts`, `scripts/apply-sql.ts`, `scripts/create-admin.ts`, `scripts/reset-2fa.ts`, `.env.example`
- Test: `tests/unit/db-guard.test.ts`

**Interfaces:**
- Produces:
  - `assertDbTestsAllowed(env: Record<string, string | undefined>): void`: throws `Error("DB tests are disabled for this database. Set DB_TESTS_ALLOWED=true only for a non-production database.")` unless `DB_TESTS_ALLOWED === "true"`.
  - `assertDbWriteAllowed(env, script: string): void`: throws unless `DB_WRITE_ALLOWED === "true"`. The message names the script.
  - `scripts/reset-dev-data.ts`, run as `npm run db:reset-dev [-- --apply]`:
    - Lists, then (with `--apply`) deletes every order, hold, payment, payment event, ticket, check-in event, consent, answer, email log and job. Follows the HANDOFF FK order, then calls `reconcile_inventory(true)`.
    - Also deletes `audit_logs` whose admin no longer exists.
    - Keeps events, categories, form fields, vouchers, settings and admins.
    - Prints the counts.

- [ ] **Step 1: Write the failing test** `tests/unit/db-guard.test.ts`. Cases:
  - `db tests refuse without opt-in` (unset, `"false"`, `"1"` all throw);
  - `db tests run with opt-in`;
  - `db scripts refuse without opt-in` (the message contains the script name).
- [ ] **Step 2: Run** `npm test -- db-guard`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.**
  - Wire `assertDbTestsAllowed` as the first setup file of `tests/db`.
  - Wire `assertDbWriteAllowed` as the first line of each DB script.
  - Add both names to `.env.example` with comments.
  - Add `DB_TESTS_ALLOWED=true` and `DB_WRITE_ALLOWED=true` to the local `.env.local`, and tell the owner. Ruling allowed: the agent appends the two lines; values are not secrets.
- [ ] **Step 4: Run** `npm test` and `npm run test:db`. Expected: PASS. With `DB_TESTS_ALLOWED` removed, `npm run test:db` stops with the message before any test runs.
- [ ] **Step 5: Run** `npm run db:reset-dev` (dry run). Expected: counts printed, nothing deleted.
- [ ] **Step 6: Commit:** `feat: opt-in guards for the shared database and a dev data reset`.

### Task 2: Client IP behind the proxy and scalable limits

**Files:**
- Modify: `src/lib/rate-limit.ts`, the call sites that pass per-IP limits (`src/app/api/holds/route.ts`, `src/app/api/orders/[uuid]/route.ts`, `src/app/api/orders/[uuid]/pay/route.ts`, `src/app/api/orders/[uuid]/tickets.pdf/route.ts`), `src/lib/env.ts`
- Test: `tests/unit/rate-limit.test.ts`

**Interfaces:**
- Produces:
  - `clientIp(headers)` returns the first match of: `x-real-ip` (set by Nginx from `$remote_addr`, after Cloudflare `real_ip`); then the current chain for dev (`cf-connecting-ip`, first `x-forwarded-for`); then `"local"`. In production `TRUST_PROXY=true` makes it use only `x-real-ip` (or `"local"` when absent), so forged headers count against the attacker's own address.
  - `ipLimit(base: number): number` = `Math.max(1, Math.round(base * RATE_LIMIT_SCALE))`, where `RATE_LIMIT_SCALE` comes from env (default `1`, range 0.1–100). Per-IP call sites use `ipLimit(60)` etc. Per-visitor and per-admin limits stay fixed.

- [ ] **Step 1: Write the failing tests.**
  - `forged forwarding headers are ignored behind the proxy` (TRUST_PROXY true: `x-forwarded-for: 1.2.3.4` and `cf-connecting-ip: 5.6.7.8` with `x-real-ip: 9.9.9.9` → `9.9.9.9`; no `x-real-ip` → `"local"`).
  - `dev keeps the forwarded chain`.
  - `rate limit scale multiplies per-IP limits` (scale 5 → `ipLimit(60) === 300`; invalid scale falls back to 1).
- [ ] **Step 2: Run** `npm test -- rate-limit`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npm run test:db -- holds-api orders-api`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: proxy-aware client IP and RATE_LIMIT_SCALE for per-IP limits`.

### Task 3: Health endpoint

**Files:**
- Create: `src/app/api/health/route.ts`
- Test: `tests/db/health.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/health` returns `{ ok: boolean, db: "ok" | "down", oldestQueuedJobSec: number | null }`, with `cache-control: no-store`.
  - 200 when the DB answers and no queued job with `run_at <= now()` is older than 300 s; otherwise 503.
  - No secrets, versions or counts beyond these.

- [ ] **Step 1: Write the failing tests:**
  - `healthy when queue is fresh`;
  - `stale queue is unhealthy` (insert a queued job with `run_at = now() - 10 min` and a unique dedupe key, expect 503, delete it in `finally`);
  - `future jobs do not count`.
- [ ] **Step 2: Run** `npm run test:db -- health`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: health endpoint for uptime monitoring`.

### Task 4: aaPanel deployment files and production env template

**Files:**
- Create: `deploy/ecosystem.config.cjs`, `deploy/nginx-anytix.conf`, `deploy/deploy.sh`, `.env.production.example`
- Modify: `package.json` (script `start:prod`: `next start -H 127.0.0.1 -p 3000`)

**Interfaces:**
- Produces:
  - **PM2 apps:**
    - `anytix-web`: `npm run start:prod`, `max_memory_restart: "1G"`.
    - `anytix-worker`: `npm run worker`.
    - Both run with `cwd` = the app folder and `NODE_ENV=production`, and log to `~/.pm2/logs`.
  - **Nginx snippet** (to paste into the aaPanel site config):
    - `proxy_pass http://127.0.0.1:3000`;
    - `proxy_set_header X-Real-IP $remote_addr`, plus Host and X-Forwarded-Proto;
    - Cloudflare `set_real_ip_from` ranges with `real_ip_header CF-Connecting-IP`, active only when the DNS record is proxied;
    - `client_max_body_size 11m`;
    - `proxy_read_timeout 30s`;
    - cache headers passed through from Next.
  - **`deploy.sh`:** `set -euo pipefail`; then `git pull --ff-only`, `npm ci`, `DB_WRITE_ALLOWED=true npm run db:migrate`, `npm run build`, `pm2 reload deploy/ecosystem.config.cjs`, then `curl -fsS http://127.0.0.1:3000/api/health`.
  - **`.env.production.example`:** every variable from `.env.example`, plus `TRUST_PROXY=true`, `RATE_LIMIT_SCALE=1`, `DB_TESTS_ALLOWED` (absent) and `DB_WRITE_ALLOWED` (absent, set only inline by `deploy.sh`). Each has a one-line Indonesian comment and production values where they are not secret (`APP_URL=https://anytix.web.id`, `MIDTRANS_IS_PRODUCTION=true`).

- [ ] **Step 1: Write the files.**
- [ ] **Step 2: Verify.**
  - `node --check deploy/ecosystem.config.cjs`;
  - `bash -n deploy/deploy.sh`;
  - `npm run build` with `APP_URL=https://anytix.web.id`;
  - `npm run start:prod`, then curl `/` and `/api/health`.

  Expected: `Strict-Transport-Security` present, CSP present, the server bound to 127.0.0.1 only (`netstat` shows `127.0.0.1:3000`).
- [ ] **Step 3: Commit:** `chore: aaPanel deployment files and production env template`.

### Task 5: Preflight checker

**Files:**
- Create: `src/lib/preflight.ts`, `scripts/preflight.ts`
- Modify: `package.json` (script `preflight`)
- Test: `tests/unit/preflight.test.ts`

**Interfaces:**
- Produces `runPreflight(s: PreflightSnapshot): Array<{ check: string; ok: boolean; detail: string }>`. The snapshot contains:
  - `env` (APP_URL, MIDTRANS_IS_PRODUCTION, Midtrans key presence, Turnstile keys, TRUST_PROXY, DB_TESTS_ALLOWED);
  - `admins` (email, active, has2fa);
  - `appliedMigrations` and `migrationFiles`;
  - `cronJobs` (job names);
  - `testEventCount` (slug like `test-%`);
  - `site` (name, CS WhatsApp/email, terms and privacy text present);
  - `smtp` (host set, `from` on the APP_URL domain);
  - `paymentMethodsEnabled`.

  Checks, each with an Indonesian `detail`:

| Check | Passes when |
|---|---|
| APP_URL | https, and not localhost or ngrok |
| Midtrans | production on, keys present |
| Turnstile | not the Cloudflare test keys |
| Proxy | `TRUST_PROXY` true |
| DB tests | `DB_TESTS_ALLOWED` not true |
| Admin email | no active admin whose email ends in `@admin.com`, `@example.com` or `.test` |
| 2FA | every active admin has 2FA |
| Migrations | every migration file applied |
| Cron jobs | `sweep-expired-holds` and `purge-identity-numbers` exist |
| Test events | none left |
| Site settings | complete |
| SMTP | `from` uses the APP_URL domain |
| Payment methods | at least one enabled |

- `npm run preflight` prints a table and exits 1 when any check fails.

- [ ] **Step 1: Write the failing test** `preflight names every blocking problem`. A snapshot with each problem gives one failing row per problem with the expected `check` names, and a clean snapshot passes every row.
- [ ] **Step 2: Run** `npm test -- preflight`. Expected: FAIL.
- [ ] **Step 3: Implement**, with `scripts/preflight.ts` reading only (no writes).
- [ ] **Step 4: Run** `npm test -- preflight`. Expected: PASS. Then `npm run preflight` locally: expected FAIL rows for the dev settings, listed in the ledger.
- [ ] **Step 5: Commit:** `feat: production preflight checker`.

### Task 6: Midtrans production switch

**Files:**
- Create: `scripts/check-midtrans.ts`
- Modify: `package.json` (script `midtrans:check`)

**Interfaces:**
- Produces `npm run midtrans:check`. Per payment method it:
  - creates one Snap transaction: Rp10.000, order id `ANYTIX-CHECK-<method>-<ms>`, expiry 5 minutes, `enabled_payments` set to that method's code;
  - prints `method | code | OK/ERROR <message>`;
  - never prints keys.

  An unpaid transaction expires and charges nothing.

- [ ] **Step 1: Write the script** (it replaces the ad hoc `_codes.mts` from Fase 3).
- [ ] **Step 2: Verify against sandbox:** `npm run midtrans:check`. Expected: 7 OK rows (the 17 Okt 2026 result).
- [ ] **Step 3: Write the owner checklist into `docs/runbook.md` §Midtrans:**
  - activate production in the Midtrans dashboard;
  - copy the production Server/Client keys into the VPS `.env.local`;
  - Settings → Configuration → Payment Notification URL `https://anytix.web.id/api/webhooks/midtrans`;
  - Finish/Unfinish/Error redirect URL `https://anytix.web.id/`;
  - run `npm run midtrans:check` on the VPS;
  - switch off in Panel → Pengaturan Transaksi every method that printed ERROR.
- [ ] **Step 4: Commit:** `chore: Midtrans payment method checker`.

### Task 7: Email on the domain

**Files:**
- Modify: `docs/runbook.md` (§Email)

- [ ] **Step 1: Write the owner checklist.**
  - Brevo → Senders, Domains & Dedicated IPs → Domains → add `anytix.web.id`, then add the DKIM, Brevo code and DMARC (`v=DMARC1; p=none; rua=mailto:…`) records at the DNS host and wait for "Authenticated".
  - Senders: add `no-reply@anytix.web.id`.
  - Security → Authorised IPs: add the VPS public IP.
  - Choose a paid plan sized for the pilot (PRD §18: 2–3 emails per order).
  - Panel → Pengaturan → Email: From `AnyTix <no-reply@anytix.web.id>`, then "Kirim email uji".
  - Check the message at mail-tester.com: score ≥ 9.
- [ ] **Step 2: Agent verification after the owner reports done:**
  - `dig TXT mail._domainkey.anytix.web.id` (selector from Brevo) and `dig TXT _dmarc.anytix.web.id` show the records;
  - `npm run preflight` SMTP row passes.
- [ ] **Step 3: Commit:** `docs: email domain checklist`.

### Task 8: Backup and restore

**Files:**
- Create: `deploy/backup-db.sh`
- Modify: `docs/runbook.md` (§Backup)

**Interfaces:**
- Produces `deploy/backup-db.sh [target-dir]`:
  - `pg_dump "$DATABASE_URL_DIRECT" -Fc --no-owner -n public -f <dir>/anytix-YYYYMMDD-HHMM.dump`. `DATABASE_URL_DIRECT` is the session pooler (port 5432), because `pg_dump` cannot use the transaction pooler.
  - Deletes dumps older than 14 days.
  - Exits non-zero on failure. The aaPanel cron runs it daily at 03.00 WIB.

- [ ] **Step 1: Write the script and the checklist.**
  - Install `postgresql-client` matching the Supabase major version.
  - Put `DATABASE_URL_DIRECT` in the VPS env.
  - Create the aaPanel cron, plus a weekly copy off the VPS (aaPanel remote storage or download).
  - Note whether the Supabase plan includes its own daily backups (Pro).
- [ ] **Step 2: Restore test** (owner-run, agent guides):
  - Restore the latest dump into a scratch database: a temporary Supabase project, or a local Postgres of the same major version, with `pg_restore --no-owner -d <scratch>`.
  - Then compare row counts of `events`, `orders`, `tickets` and `admins` with production. Expected: equal at dump time.
  - Record the date in the runbook.
- [ ] **Step 3: Verify:** `bash -n deploy/backup-db.sh`.
- [ ] **Step 4: Commit:** `chore: daily database backup script and restore drill`.

### Task 9: Runbook

**Files:**
- Create: `docs/runbook.md` (Indonesian; Tasks 6–8 already added their sections)

- [ ] **Step 1: Write the sections.**
  1. **Peta sistem:** domain, VPS, aaPanel, PM2 apps, Supabase, Midtrans, Brevo, Cloudflare. Says where each secret lives.
  2. **Deploy pertama:**
     - aaPanel: install Node 22 and PM2, create the site for `anytix.web.id` with Let's Encrypt, and paste the Nginx snippet;
     - clone the repo, fill `.env.local` from `.env.production.example`, run `deploy/deploy.sh`, then `pm2 save` and `pm2 startup`;
     - firewall: 80/443 only.
  3. **Deploy rutin dan rollback:** `git checkout <commit>`, then `deploy.sh`. Migrations are forward-only, so a rollback may need a fix-forward migration.
  4. **Sebelum on-sale event besar:**
     - set `hold_minutes`, `pay_minutes`, `service_fee` and the payment methods;
     - check quotas, vouchers and the Turnstile widget;
     - confirm `/api/health` 200 and the worker running (`pm2 status`);
     - keep `RATE_LIMIT_SCALE=1`.
  5. **Hari-H gerbang:**
     - each phone logs in with an admin account that has 2FA, installs the PWA and names its gate;
     - there is no offline mode, so a phone without signal uses another phone or manual entry;
     - "Terbitkan ulang QR" when a ticket link leaks.
  6. **Insiden:**
     - **Webhook gagal:** the order still finalises through `payment-check`. Check `payment_events`.
     - **Worker mati:** health 503, then `pm2 restart anytix-worker`.
     - **Selisih kuota:** an admin alert email, then `reconcile_inventory`.
     - **Pembayaran terlambat:** refund in the Midtrans dashboard, then "Tandai sudah direfund".
     - **Email tidak sampai:** Brevo logs, authorised IP, `email_logs`.
     - **SMTP 525:** the VPS IP changed.
  7. **Akun dan rahasia:**
     - adding or deactivating admins;
     - 2FA recovery (`npm run admin:reset-2fa` on the VPS with `DB_WRITE_ALLOWED=true`);
     - rotating `COOKIE_SECRET` (logs everyone out);
     - never rotate `DATA_ENCRYPTION_KEY` without a re-encrypt script.
  8. **PDP:**
     - identity numbers are purged 60 days after the event;
     - handling a buyer's deletion request (manual SQL listed, with FK order);
     - who may use "Tampilkan nomor lengkap".
  9. **Kontak dan eskalasi:** placeholders for the owner to fill.
- [ ] **Step 2: Verify:** every command in the runbook exists in `package.json` or `deploy/`, and every panel path matches a real page.
- [ ] **Step 3: Commit:** `docs: production runbook`.

### Task 10: Production cutover and load test

Owner-run with agent guidance. Nothing is committed until Step 6.

- [ ] **Step 1: Prepare the shared database.**
  - Owner: set `DB_TESTS_ALLOWED` off on every machine.
  - Owner: replace `admin@admin.com` and enable 2FA for every admin.
  - Agent: run `npm run db:reset-dev -- --apply` (with `DB_WRITE_ALLOWED=true`) after the owner confirms. Ask the owner whether to keep the sample event "Jazz di Taman 2026".
- [ ] **Step 2: Deploy** (runbook §2): DNS A record to the VPS, aaPanel site with SSL, `.env.local` from the template, then `deploy/deploy.sh`.
- [ ] **Step 3: Configure.**
  - Real Turnstile keys for `anytix.web.id`.
  - Midtrans production (Task 6 checklist and `midtrans:check`).
  - Email domain (Task 7).
  - Backup cron (Task 8).
  - Uptime monitor on `https://anytix.web.id/api/health` (UptimeRobot or aaPanel), alerting the owner.
- [ ] **Step 4: Run preflight.** `npm run preflight` on the VPS. Expected: every row PASS.
- [ ] **Step 5: Load test** before the first public on-sale, with k6 on a machine outside the VPS:
  - Create a hidden test event "Uji Beban" (slug `uji-beban`, Reguler capacity 100).
  - Set `RATE_LIMIT_SCALE=10` in the VPS `.env.local` and `pm2 reload anytix-web`.
  - Run `k6/hold-rush.js` (300 VU): expected `holds_created` = 100, the rest 409, p95 hold < 150 ms.
  - Run `k6/event-page.js` against the pilot event page: p95 < 500 ms, errors < 1%.
  - Run `select * from reconcile_inventory(false)`: expected empty.
  - Afterwards, set `RATE_LIMIT_SCALE=1`, reload, and delete the test event's holds and the event (FK order).
  - Record the numbers in the runbook.
- [ ] **Step 6: Production smoke test.**
  - Buy one ticket for a real event with a real small payment (QRIS).
  - Expected: LUNAS on `/orders/{uuid}`, the "Pembayaran berhasil" email in the inbox from `no-reply@anytix.web.id`, the PDF opens, and a scan at `/admin/check-in` turns green.
  - Refund it from the Midtrans dashboard and mark the order in the panel per the runbook.
- [ ] **Step 7: Checkpoint.** `npm test` and `npm run test:db` (on a machine with opt-in pointing at a non-production database, or skipped with a ledgered ruling), `lint`, `tsc`, `build`, AGENTS.md comment check, whole-phase review by a fresh reviewer, HANDOFF updated for operations, commit, push, report to the owner in Indonesian.
