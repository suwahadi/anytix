# Fase 2 — Booking Inti Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guest picks tickets, gets a server-side slot lock, fills buyer data, chooses QRIS or a VA bank, pays in the Midtrans sandbox, and sees LUNAS on `/orders/{uuid}`. Webhooks, the worker (email, payment-check, reconciliation) and the sweeper keep every hold and order consistent, and the admin can find, cancel and follow up orders.

**Architecture:** The Fase 0 plpgsql engine (`reserve_tickets`, `quote_hold`, `checkout_hold`, `apply_payment_status`, `issue_late_order`, `sweep_expired_holds`, `reconcile_inventory`) stays the only writer of quota. Fase 2 adds thin Route Handlers under `/api/holds`, `/api/orders`, `/api/webhooks/midtrans` and `/api/admin/orders`, a fetch-based Midtrans client, worker job handlers, email templates, the checkout and order pages, and the admin Pesanan module.

**Tech Stack:** Next.js 16.4 (cacheComponents, partialPrefetching), postgres.js, zod 4, nodemailer 10, Cloudflare Turnstile (test keys), Midtrans Snap + Core API over `fetch`, vitest.

**Spec:** `PRD.md` + `docs/superpowers/specs/2026-10-17-anytix-mvp-design.md` (design doc wins on conflict). Builds on Fase 0 (`2026-10-17-fase-0-fondasi.md`) and Fase 1 (`2026-10-17-fase-1-katalog-admin.md`); read `docs/superpowers/HANDOFF.md` first.

## Global Constraints

- Everything in the Fase 0 and Fase 1 Global Constraints still applies (AGENTS.md comments, no AI attribution in commits, naming, plpgsql rules, lock order, `transaction()` not `sql.begin`, admin mutation rules, Next.js 16 rules, antislop during the work with dials ENERGY 1 / RHYTHM 2 / MOTION 1).
- Booking steps (PRD §8): **1 Pilih Tiket → 2 Detail Pesanan → 3 Metode Pembayaran → 4 Pembayaran**. Copy that the PRD fixes is used verbatim: "Batas Waktu Tersisa", "Lanjutkan", "Konfirmasi Pesanan", "Edit Data", "Saya Mengerti", "Bayar Sekarang", "Waktu habis, slot dilepas", "Pilih ulang tiket", "Batalkan pilihan tiket?", "Kuota {nama} tidak cukup, sisa {n}", "Selesaikan Pembayaran", "Silakan lakukan pembayaran sebelum {tanggal jam}", "Pesan lagi". Order statuses shown to buyers: PENDING, LUNAS, KEDALUWARSA, DIBATALKAN.
- Timing (PRD §6, §12): hold = `hold_minutes`; checkout sets hold `expires_at = now + pay_minutes + pay_grace_minutes` and `pay_expires_at = now + pay_minutes`; Snap `expiry = { start_time: <orders.created_at as "YYYY-MM-DD HH:mm:ss +0700">, unit: "minute", duration: <minutes between created_at and pay_expires_at> }` and `page_expiry = { duration: <same>, unit: "minutes" }`.
- Countdowns never trust the device clock: every hold and order response carries `serverNow`, and the client counts down from `expiresAt - serverNow` measured from when the response arrived. The colour changes below 60 s (PRD §17).
- Payment methods: keys and Snap codes come from `PAYMENT_METHODS` in `src/lib/validation/settings.ts` (`qris → other_qris`, `bca → bca_va`, `bni → bni_va`, `bri → bri_va`, `mandiri → echannel`, `permata → permata_va`, `cimb → cimb_va`). `orders.payment_method` and `payments.payment_method` store the key. Snap gets exactly one code in `enabled_payments`.
- Midtrans: Snap `POST {app}/snap/v1/transactions`, Core `GET {api}/v2/{order_id}/status`, `POST {api}/v2/{order_id}/expire`, `POST {api}/v2/{order_id}/cancel`; `{app}` is `https://app.sandbox.midtrans.com` (or `https://app.midtrans.com` when `MIDTRANS_IS_PRODUCTION`), `{api}` is `https://api.sandbox.midtrans.com` (or `https://api.midtrans.com`). Auth header `Basic base64(serverKey + ":")`. `X-Override-Notification: MIDTRANS_NOTIFICATION_URL` when set. Paid means `transaction_status = settlement` and `status_code = 200`. Deviation from the design doc §2: plain `fetch` instead of `midtrans-client` (four calls; no dependency).
- Turnstile: widget script `https://challenges.cloudflare.com/turnstile/v0/api.js`, server check `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` with `TURNSTILE_SECRET_KEY`. Required on `POST /api/holds` and `POST /api/holds/{id}/checkout`.
- Every `/api/holds*` and `/api/orders*` response: `cache-control: no-store`. `/api/orders*` adds `referrer-policy: no-referrer`. `/checkout/*` and `/orders/*` pages export `robots: { index: false, follow: false }` and read cookies/params inside `<Suspense>`.
- Visitor identity is the signed `vid` cookie (`readVisitorId`); a hold belongs only to its visitor. Order pages are reachable by `public_uuid` only (PRD §19); the invoice code is never an access key.
- Identity numbers: never in logs, emails, payloads to Midtrans, job payloads or API responses; masked as `3201********0001` wherever shown (PRD §14).
- Jobs: `jobs.dedupe_key` is unique forever, so a repeatable job needs a key that changes per attempt (`…:resend:<ms>`, `…:recon:<YYYY-MM-DDTHH>`).
- Out of scope (Fase 3): QR images, PDF, scanner, voucher admin and the promo modal ("Lebih hemat pakai promo" is not shown; `quote` still accepts a code), PDP full-reveal and retention, sales dashboard, admin accounts. The paid order page shows the ticket list (category, "Tiket 1 dari N") without QR, with the note "QR e-ticket tampil di sini sebelum hari acara." **Ask the owner before shipping this wording.**

## Review Focus

1. A buyer double-clicks "Beli Sekarang", or the browser retries the request: the second request carries the same `Idempotency-Key` and an already-used Turnstile token, and must get the same hold, not a 403 (Task 2 test `replayed idempotency key skips turnstile`).
2. The buyer's device clock is 30 seconds or more off: the countdown still ends when the server says the hold ends (Task 8 unit test `countdown ignores device clock offset`).
3. The hold runs out while the buyer is on step 3 and presses "Bayar Sekarang": the API answers 410 `HOLD_EXPIRED`, the page shows "Waktu habis, slot dilepas", and the form draft is still in `sessionStorage` (Task 4 test `checkout on expired hold is 410`, Task 8 browser step).
4. Midtrans sends a webhook for an order we do not know, a duplicate settlement, or an `expire` after `settlement`: the endpoint answers 200 every time and the order state does not regress (Task 5 tests `unknown order is 200`, `duplicate settlement is a no-op`, `expire after settlement keeps paid`).
5. The buyer never opened Snap, so Midtrans has no transaction (Get Status 404) when `payment-check` runs after the deadline: the order becomes `expired` and the job completes instead of retrying forever (Task 6 test `payment-check without midtrans transaction expires order`).

## File Structure

```
db/migrations/0007_booking.sql                   reserve_tickets rejects ended events (NOT_ON_SALE)
src/lib/public-route.ts                           visitorRoute(schema, handler): vid cookie, origin check, zod 422, UserError, no-store
src/lib/turnstile.ts                              verifyTurnstile(token, ip)
src/lib/booking/hold-errors.ts                    HoldError → { status, error, fields }
src/lib/booking/hold-view.ts                      getHoldView, quoteHold
src/lib/booking/buyer.ts                          normalizePhone, buyerInput
src/lib/booking/checkout-service.ts               checkoutHold (answers, encryption, consents → checkout_hold)
src/lib/booking/order-view.ts                     getOrderView, displayStatus
src/lib/booking/countdown.ts                      remainingMs (client-safe)
src/lib/payments/midtrans.ts                      Snap + Core API client, signature check, toEngineStatus
src/lib/payments/snap-payload.ts                  buildSnapPayload (pure)
src/lib/payments/payment-service.ts               ensureSnapToken, syncPaymentStatus, applyPaymentStatus
src/lib/email/templates.ts                        DEFAULT_EMAIL_TEMPLATES, fillPlaceholders, getEmailTemplates
src/lib/email/order-emails.ts                     loadOrderEmailData, renderOrderEmail
src/lib/mask.ts                                   maskIdentity, maskEmail
src/lib/admin/order-admin-service.ts              list/get/cancel/resend/issueLate/markRefunded/countLatePaid
src/app/api/holds/route.ts                        POST
src/app/api/holds/[id]/route.ts                   GET, DELETE
src/app/api/holds/[id]/quote/route.ts             POST
src/app/api/holds/[id]/checkout/route.ts          POST
src/app/api/orders/[uuid]/route.ts                GET
src/app/api/orders/[uuid]/pay/route.ts            POST (Snap token, created lazily)
src/app/api/webhooks/midtrans/route.ts            POST
src/app/api/admin/orders/…                        GET list, GET [id], POST [id]/cancel, [id]/resend-email, [id]/issue-tickets, [id]/mark-refunded
src/app/(public)/checkout/[holdId]/…              page.tsx, checkout-flow.tsx (client)
src/app/(public)/orders/[uuid]/…                  page.tsx, order-status.tsx (client)
src/components/turnstile-widget.tsx               client widget with reset()
src/components/countdown.tsx                      client countdown from remainingMs
src/app/admin/(panel)/orders/…                    list page, [id] detail page
src/app/admin/(panel)/settings/templates/…        email template editor
worker/handlers/{email,payment-check,reconcile,admin-alert}.ts
worker/index.ts                                   handler map + hourly reconcile enqueue
next.config.ts                                    production security headers (CSP, HSTS)
tests/unit/*.test.ts, tests/db/*.test.ts
```

---

### Task 1: Fase 1 carry-overs that the booking flow depends on

**Files:**
- Create: `db/migrations/0007_booking.sql`
- Modify: `src/lib/validation/settings.ts`, `src/lib/validation/catalog.ts`, `src/lib/settings-service.ts`
- Test: `tests/db/reserve.test.ts`, `tests/db/settings.test.ts`, `tests/unit/form-schema.test.ts`

**Interfaces:**
- Consumes: Fase 0 `reserve_tickets`, Fase 1 `transactionSettings`, `formFieldInput`, `putSettingsGroup`.
- Produces: `reserve_tickets` raises `NOT_ON_SALE` when `events.ends_at <= now()`; `transactionSettings` refuses a payload with every method off (field `paymentMethods`: "Aktifkan minimal satu metode pembayaran."); `formFieldInput` refuses `minLength > maxLength`, `min > max`, `minDate > maxDate`, `minSelected > maxSelected` (message on the max field: "Harus lebih besar atau sama dengan nilai minimal.") and a `pattern` that is longer than 200 characters or does not compile ("Pola regex tidak valid."); `putSettingsGroup(…, "smtp", …)` with a changed `host` and an empty password throws `UserError` 422 `{ password: "Isi ulang kata sandi karena host SMTP berubah." }`.

- [ ] **Step 1: Write the failing tests.**
  - `reserve.test.ts` `ended event is not on sale`: an event with `ends_at = now() - 1 min` throws `HoldError` code `NOT_ON_SALE`.
  - `settings.test.ts` `all payment methods off is refused` and `smtp host change needs the password again` (same host with empty password still keeps the stored password).
  - `form-schema.test.ts` (or a new `tests/unit/catalog-validation.test.ts`): each min/max pair, a 201-char pattern, and `"(["` are rejected with the messages above.
- [ ] **Step 2: Run** `npm test` and `npm run test:db`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** `0007_booking.sql` re-creates `reserve_tickets` from `0005_review_fixes.sql` with `and e.ends_at > now()` in the session lookup and repeats the `revoke`; run `npm run db:migrate`. Validation uses zod `superRefine`.
- [ ] **Step 4: Run** both suites. Expected: PASS.
- [ ] **Step 5: Commit:** `fix: close sale after the event ends, guard settings and form field rules`.

### Task 2: Holds API

**Files:**
- Create: `src/lib/public-route.ts`, `src/lib/turnstile.ts`, `src/lib/booking/hold-errors.ts`, `src/lib/booking/hold-view.ts`, `src/app/api/holds/route.ts`, `src/app/api/holds/[id]/route.ts`, `src/app/api/holds/[id]/quote/route.ts`
- Modify: `src/lib/admin-route.ts` (export `foreignOrigin` and `errorBody(e: UserError)` for reuse)
- Test: `tests/db/holds-api.test.ts`

**Interfaces:**
- Consumes: `reserveTickets`, `releaseHold`, `HoldError` (Fase 0), `readVisitorId`, `rateLimit`, `UserError`, `validationResponse`.
- Produces:
  - `visitorRoute<T>(schema: ZodType<T> | null, handler: (ctx: { visitorId: string; req: NextRequest; params: Record<string, string>; body: T }) => Promise<Response>)`. No valid `vid` cookie gives 401 `{ error: "Sesi pembelian tidak dikenali. Muat ulang halaman." }`; a foreign `Origin` on non-GET gives 403; zod errors give 422; `UserError` maps like `adminRoute`; every response gets `cache-control: no-store`.
  - `verifyTurnstile(token: string, ip: string | null): Promise<boolean>`; network failure returns false.
  - `holdErrorResponse(e: HoldError, names: Map<number, string>): NextResponse`:
    - `SOLD_OUT` → 409 `{ error: "Kuota {nama} tidak cukup, sisa {n}", code, inventoryId, available }`.
    - `MAX_PER_ORDER` → 422 `{ error: "Maksimal {max} tiket {nama} per transaksi.", code, inventoryId, max }`.
    - `CATEGORY_NOT_ON_SALE` → 409 `{ error: "Tiket {nama} sedang tidak dijual.", code, inventoryId }`.
    - `NOT_ON_SALE` → 409 `{ error: "Penjualan tiket event ini sedang ditutup.", code }`.
    - `INVALID_ITEMS` → 422 `{ error: "Pilihan tiket tidak valid. Muat ulang halaman.", code }`.
    - `CONCURRENT` → 409 `{ error: "Ada permintaan lain yang sedang diproses. Coba lagi.", code }`.
  - `type HoldView = { id: string; status: "held" | "pending_payment" | "paid" | "released" | "expired"; expiresAt: string; serverNow: string; orderUuid: string | null; event: { id: number; slug: string; title: string; startsAt: string; endsAt: string; timezone: string; venue: string; city: string; posterPath: string | null }; items: Array<{ inventoryId: number; name: string; qty: number; unitPrice: number; lineTotal: number; admitsPerUnit: number }>; fields: FormFieldDef[]; paymentMethods: Array<{ key: string; label: string; group: "qris" | "va" }>; serviceFee: number; hasIdentityField: boolean }`.
  - `getHoldView(holdId: string, visitorId: string): Promise<HoldView | null>`: null for a missing hold or another visitor's hold; `fields` are the event's active form fields in position order; `paymentMethods` are the enabled ones in `PAYMENT_METHODS` order; `orderUuid` is the order for this hold when one exists.
  - `quoteHold(holdId: string, visitorId: string, voucherCode: string | null): Promise<{ items: …; subtotal: number; discount: number; fee: number; total: number; voucherError: string | null }>` over `quote_hold`; `HOLD_NOT_FOUND` → `UserError` 404 "Pesanan tidak ditemukan.", `HOLD_EXPIRED` → `UserError` 410 "Waktu habis, slot dilepas".
  - `POST /api/holds` body `{ eventId: number; items: Array<{ inventoryId: number; qty: number }> (1–20 entries); turnstileToken: string }`, header `Idempotency-Key` (8–100 chars, else 422). Order of work:
    1. Rate limit 10/min per visitor and 60/min per IP (`x-forwarded-for` first entry) → 429 "Terlalu banyak percobaan. Coba lagi sebentar lagi."
    2. If a hold already exists for `(visitor, Idempotency-Key)`, return it (200) without checking Turnstile (Review Focus 1).
    3. `verifyTurnstile` false → 403 "Verifikasi keamanan gagal. Coba lagi."
    4. `reserveTickets`; success → 201 `{ holdId, expiresAt, serverNow }`; `HoldError` → `holdErrorResponse`.
  - `GET /api/holds/{id}` → 200 `HoldView` or 404 `{ error: "Pesanan tidak ditemukan." }`.
  - `DELETE /api/holds/{id}` → 200 `{ released: boolean }`.
  - `POST /api/holds/{id}/quote` body `{ voucherCode?: string }` → 200 quote, or the `quoteHold` errors.

- [ ] **Step 1: Write the failing tests** `tests/db/holds-api.test.ts`. Routes are called as plain functions with `NextRequest`, a signed `vid` cookie from `newVisitorCookie()`, and `vi.mock("@/lib/turnstile")` returning a controllable boolean.
  - `creates a hold`: 201, `expiresAt - serverNow` about `hold_minutes` minutes, inventory `held` up by qty.
  - `replayed idempotency key skips turnstile`: second call with the same key and Turnstile mocked to false returns 200 with the same `holdId`.
  - `turnstile failure is 403` and `missing idempotency key is 422`.
  - `sold out names the category`: capacity 1, qty 2 gives 409 `"Kuota Reguler tidak cukup, sisa 1"` with `available` 1.
  - `rate limited after 10`: the 11th POST from the same visitor in a minute is 429.
  - `get hold view is owner only`: owner gets items, `fields`, `paymentMethods`, `serviceFee 5000`; another visitor gets 404; no `vid` gets 401.
  - `delete releases`: `{ released: true }` and `held` back to 0.
  - `quote on expired hold is 410`: after `expires_at` is forced into the past.
- [ ] **Step 2: Run** `npm run test:db -- holds-api`. Expected: FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run** `npm run test:db -- holds-api`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(booking): holds API with turnstile, idempotency and quote`.

### Task 3: Midtrans client and Snap payload

**Files:**
- Create: `src/lib/payments/midtrans.ts`, `src/lib/payments/snap-payload.ts`
- Test: `tests/unit/midtrans.test.ts`, `tests/unit/snap-payload.test.ts`

**Interfaces:**
- Consumes: `getEnv()` (`MIDTRANS_SERVER_KEY`, `MIDTRANS_IS_PRODUCTION`, `MIDTRANS_NOTIFICATION_URL`, `MIDTRANS_CLIENT_KEY`), `PAYMENT_METHODS`.
- Produces:
  - `class MidtransError extends Error { status: number; body: unknown }`.
  - `type MidtransStatus = { order_id: string; transaction_status: string; status_code: string; gross_amount: string; transaction_id?: string; payment_type?: string; [k: string]: unknown }`.
  - `createSnapTransaction(payload: SnapPayload): Promise<{ token: string; redirectUrl: string }>`; non-2xx throws `MidtransError`.
  - `getTransactionStatus(orderId: string): Promise<MidtransStatus | null>`; HTTP 404, or a body with `status_code` `"404"`, returns null.
  - `expireTransaction(orderId: string): Promise<void>` and `cancelTransaction(orderId: string): Promise<void>`; a 404 is not an error.
  - `verifyNotificationSignature(body: { order_id: string; status_code: string; gross_amount: string; signature_key: string }, serverKey?: string): boolean` with `crypto.timingSafeEqual` over SHA-512 hex of `order_id + status_code + gross_amount + serverKey`.
  - `toEngineStatus(s: MidtransStatus): "settlement" | "expire" | "cancel" | "deny" | "failure" | null`: `settlement` only with `status_code === "200"`; `pending` and anything unknown give null.
  - `snapScriptUrl(): string` (`{app}/snap/snap.js`) and `midtransClientKey(): string` for the order page.
  - `type SnapOrder = { midtransOrderId: string; createdAt: Date; payExpiresAt: Date; paymentMethod: string; buyer: { name: string; email: string; phone: string }; items: Array<{ ticketCategoryId: number; name: string; qty: number; unitPrice: number }>; discount: number; fee: number; total: number }`.
  - `buildSnapPayload(order: SnapOrder): SnapPayload` (pure): `transaction_details { order_id, gross_amount: total }`; one `item_details` row per item (`id: "tc-<id>"`, `name` cut to 50 characters, `price`, `quantity`), a `{ id: "discount", name: "Diskon", price: -discount, quantity: 1 }` row when discount > 0, a `{ id: "service-fee", name: "Biaya Layanan", price: fee, quantity: 1 }` row when fee > 0; `customer_details { first_name, email, phone }`; `enabled_payments: [code]`; expiry and page_expiry as in Global Constraints.

- [ ] **Step 1: Write the failing tests.**
  - `snap-payload.test.ts`: `item rows sum to gross_amount` (2 × 100000, discount 15000, fee 5000 gives total 190000 and the rows sum to it); `long names are cut to 50`; `expiry uses Jakarta offset` (`createdAt 2026-12-01T03:04:05Z` gives `start_time "2026-12-01 10:04:05 +0700"`, duration 15 for a 15-minute window); `bank key maps to snap code` (`mandiri` gives `["echannel"]`); `no fee row when fee is 0`.
  - `midtrans.test.ts` with `vi.stubGlobal("fetch", …)`: `signature check` (a known vector built in the test with `createHash`; a one-character change fails); `status 404 returns null`; `settlement needs status 200` (`status_code "201"` with `settlement` gives null); `create sends basic auth and override header` (asserts the URL, `Authorization`, `X-Override-Notification`); `create failure throws MidtransError with status`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(payments): fetch-based Midtrans client and Snap payload`.

### Task 4: Checkout API and Snap token

**Files:**
- Create: `src/lib/booking/buyer.ts`, `src/lib/booking/checkout-service.ts`, `src/lib/payments/payment-service.ts` (`ensureSnapToken` part), `src/app/api/holds/[id]/checkout/route.ts`, `src/app/api/orders/[uuid]/pay/route.ts`
- Test: `tests/unit/buyer.test.ts`, `tests/db/checkout-api.test.ts`

**Interfaces:**
- Consumes: `visitorRoute`, `verifyTurnstile`, `getHoldView` (Task 2), `buildSnapPayload`, `createSnapTransaction` (Task 3), `buildAnswersSchema`, `encrypt`, `getSettingsGroup("site")`, Fase 0 `checkout_hold`.
- Produces:
  - `normalizePhone(countryCode: string, input: string): string | null`: digits only; drops one leading `0`; drops a repeated country code; result is `countryCode + rest`, 10–15 digits, else null. `countryCode` is one of `"62" | "60" | "65" | "61" | "1"`.
  - `buyerInput` zod: `name` 2–100 chars ("Nama minimal 2 karakter."), `email` ("Email tidak valid."), `countryCode`, `phone` → normalized ("Nomor WhatsApp tidak valid.").
  - `checkoutHold(input: { holdId: string; visitorId: string; buyer: { name: string; email: string; phone: string }; answers: Record<string, unknown>; paymentMethod: string; consents: { terms: boolean; privacy: boolean }; ip: string | null }): Promise<{ orderId: number; orderUuid: string }>`:
    - Both consents must be true, else `UserError` 422 `{ consents: "Centang kedua persetujuan untuk melanjutkan." }`.
    - `paymentMethod` must be an enabled key, else 422 `{ paymentMethod: "Pilih metode pembayaran." }`.
    - Answers are validated with `buildAnswersSchema(activeFields)`; failures are 422 with fields keyed `answers.<key>`.
    - `p_answers`: identity fields send `value: { type }` and `value_encrypted: encrypt(number).toString("base64")`; other fields send `value` as parsed.
    - `p_consents`: `{ purpose: "terms" }`, `{ purpose: "privacy" }` and, when the event has an identity field, `{ purpose: "identity_verification" }`; all with `policy_version = site.privacyUpdatedAt ?? "initial"` and `ip`.
    - Engine errors: `HOLD_EXPIRED` → 410 "Waktu habis, slot dilepas"; `HOLD_NOT_FOUND` → 404; `VOUCHER_INVALID:*` and `VOUCHER_UNAVAILABLE` → 409 "Kode promo tidak bisa dipakai."; `INVALID_BUYER` → 422.
  - `ensureSnapToken(orderId: number): Promise<{ token: string } | { error: string }>`: returns the stored `payments.snap_token` of the latest attempt; otherwise builds the payload, calls Snap, stores `snap_token` and `redirect_url`. It refuses (`{ error: "Batas bayar sudah lewat." }`) when the order is not `awaiting_payment` or `pay_expires_at` has passed. A `MidtransError` gives `{ error: "Pembayaran belum bisa disiapkan. Coba lagi sebentar lagi." }` and is logged with the order id only. `shortcut:` comment: a Snap call that succeeded at Midtrans but whose response was lost leaves this `order_id` unusable; the buyer then needs CS, until attempt rotation is built.
  - `POST /api/holds/{id}/checkout` body `{ turnstileToken; buyer: { name; email; countryCode; phone }; answers; paymentMethod; consents: { terms; privacy } }`:
    1. If the hold already has an order, return 200 `{ orderUuid }` without Turnstile (idempotent per hold, Fase 0 design).
    2. Turnstile false → 403.
    3. `checkoutHold`, then `ensureSnapToken` (its error does not fail the request).
    4. 201 `{ orderUuid }`.
  - `POST /api/orders/{uuid}/pay` (no visitor check; the UUID is the key) → 200 `{ token, clientKey, scriptUrl }` or 409 `{ error }`; rate limit 20/min per IP.

- [ ] **Step 1: Write the failing tests.**
  - `buyer.test.ts`: `"0812-3456-7890"` with 62 gives `"6281234567890"`; `"+62 812 3456 7890"` gives the same; `"812345"` gives null; `"6281234567890"` typed with 62 is not doubled.
  - `checkout-api.test.ts` (Turnstile and `createSnapTransaction` mocked):
    - `checkout creates order and snap token`: 201, `orders.status awaiting_payment`, `payments.snap_token` stored, consents `terms` + `privacy`.
    - `identity answer is encrypted and never in the payload`: the mocked Snap call receives no identity number; `order_answers.value` is `{ type: "KTP" }`.
    - `second checkout returns the same order without turnstile`.
    - `checkout on expired hold is 410` (Review Focus 3).
    - `missing consent is 422` and `disabled payment method is 422`.
    - `answer validation errors are keyed by field`: a required field left empty gives `fields["answers.ukuran"]`.
    - `snap failure still returns the order`: Snap mocked to throw gives 201, and a later `POST /api/orders/{uuid}/pay` with Snap working returns a token.
    - `pay after deadline is 409`.
- [ ] **Step 2: Run** `npm test` and `npm run test:db -- checkout-api`. Expected: FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run** both. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(booking): checkout API with answer validation, consents and Snap token`.

### Task 5: Midtrans webhook and status sync

**Files:**
- Create: `src/app/api/webhooks/midtrans/route.ts`
- Modify: `src/lib/payments/payment-service.ts` (`applyPaymentStatus`, `syncPaymentStatus`)
- Test: `tests/db/webhook.test.ts`

**Interfaces:**
- Consumes: `getTransactionStatus`, `toEngineStatus`, `verifyNotificationSignature` (Task 3), Fase 0 `apply_payment_status`.
- Produces:
  - `applyPaymentStatus(midtransOrderId: string, status: "settlement" | "expire" | "cancel" | "deny" | "failure", payload: object): Promise<{ found: boolean; orderId?: number; publicUuid?: string; status?: string; changed?: boolean }>`.
  - `syncPaymentStatus(midtransOrderId: string): Promise<{ midtrans: "missing" | "pending" | "applied"; result?: Awaited<ReturnType<typeof applyPaymentStatus>> }>`: Get Status is the source of truth (PRD §12); null gives `missing`; `toEngineStatus` null gives `pending` and only stores `raw_last` on the payment; otherwise `applyPaymentStatus`.
  - `POST /api/webhooks/midtrans`: invalid JSON or a bad signature → 401 `{ error: "invalid signature" }`; otherwise `syncPaymentStatus(order_id)` and 200 `{ ok: true }`, also for unknown orders and duplicates. Errors after the signature check are logged with the order id and still answer 200 so Midtrans does not hammer the endpoint; the `payment-check` and reconciliation jobs repair state. The route is not under the proxy matcher and sets no cookie.

- [ ] **Step 1: Write the failing tests** `tests/db/webhook.test.ts` (Get Status mocked per test; orders made with `checkoutTestOrder`):
  - `bad signature is 401` and `settlement makes the order paid` (tickets issued, job `email:paid:<id>` queued).
  - `duplicate settlement is a no-op` (Review Focus 4): same notification twice; one `payment_events` row per distinct `(order, status, transaction_id)`; `sold` unchanged.
  - `expire after settlement keeps paid` (Review Focus 4).
  - `unknown order is 200` (Review Focus 4): signature valid, order id `NOPE-1`.
  - `pending notification changes nothing`: order stays `awaiting_payment`, `payments.raw_last` updated.
  - `notification body is not trusted`: the body says `settlement` but Get Status says `pending`; the order stays `awaiting_payment`.
- [ ] **Step 2: Run** `npm run test:db -- webhook`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test:db -- webhook`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(payments): Midtrans webhook verified by signature and Get Status`.

### Task 6: Worker jobs: email, payment-check, reconciliation, admin alerts

**Files:**
- Create: `src/lib/email/templates.ts`, `src/lib/email/order-emails.ts`, `src/lib/mask.ts`, `worker/handlers/email.ts`, `worker/handlers/payment-check.ts`, `worker/handlers/reconcile.ts`, `worker/handlers/admin-alert.ts`
- Modify: `worker/index.ts`
- Test: `tests/unit/email-templates.test.ts`, `tests/unit/mask.test.ts`, `tests/db/worker-jobs.test.ts`

**Interfaces:**
- Consumes: `getEmailProvider`, `enqueueJob`, `syncPaymentStatus`, `applyPaymentStatus`, `expireTransaction` (Tasks 3, 5), Fase 0 `reconcile_inventory`, `formatRupiah`, `formatEventSchedule`.
- Produces:
  - `type EmailType = "awaiting_payment" | "paid" | "expired" | "late_paid"`.
  - `type EmailTemplates = Record<EmailType, { subject: string; body: string }>`; `DEFAULT_EMAIL_TEMPLATES` (Indonesian, using only the placeholders below); `EMAIL_PLACEHOLDERS = ["nama", "event", "invoice", "total", "batas_bayar", "tautan_pesanan"]`; `fillPlaceholders(text: string, vars: Record<string, string>, escape: boolean): string` (unknown placeholders are left as typed; HTML-escaped when `escape`); `getEmailTemplates(): Promise<EmailTemplates>` (settings key `email_templates` merged over the defaults).
  - `renderOrderEmail(type: EmailType, data: OrderEmailData, templates: EmailTemplates): EmailMessage`: a fixed HTML layout around the editable subject and paragraph, plus per type: awaiting_payment adds item lines, total and "Bayar sebelum {batas_bayar}"; paid adds the order link, event schedule, venue and refund policy; expired adds the event link; late_paid adds the CS contact. Plain-text part included. The order link is `${APP_URL}/orders/${publicUuid}`.
  - `maskIdentity("3201234567890001") === "3201********0001"` (keep first 4 and last 4; shorter than 9 keeps the last 2); `maskEmail("budi.santoso@example.com") === "b***@example.com"`.
  - Worker handler map `{ email, "payment-check": paymentCheck, reconcile, "admin-alert": adminAlert }`:
    - `email({ type, order_id, to? })`: loads the order, renders, sends to `to ?? buyer_email`, writes `email_logs` (`sent` with `message_id`, or `failed` with the error, then rethrows so the job retries). Logs show `maskEmail(to)` only.
    - `payment-check({ order_id })`: for the order's latest payment: `syncPaymentStatus`; when `missing`, apply `expire` locally (Review Focus 5); when `pending` and `pay_expires_at` has passed, `expireTransaction` then apply `expire`; when `pending` before the deadline, do nothing. Orders no longer `awaiting_payment` are skipped.
    - `reconcile()`: `select * from reconcile_inventory(true)`; drift rows enqueue `admin-alert` with key `admin-alert:drift:<YYYY-MM-DDTHH>`; payments `pending` whose order is `awaiting_payment` and `created_at < now() - (pay_minutes + 10) minutes` enqueue `payment-check` with key `payment-check:<order_id>:recon:<YYYY-MM-DDTHH>`.
    - `admin-alert({ kind: "late_paid" | "drift", order_id?, rows? })`: emails every active admin (subject "Perlu tindak lanjut: pembayaran terlambat {invoice}" or "Selisih kuota terdeteksi").
    - `worker/index.ts` enqueues `reconcile` with key `reconcile:<YYYY-MM-DDTHH>` once per loop iteration (the dedupe makes it hourly).
- Note: Fase 0 already queues `admin-alert` jobs with payload `{ order_id }` for late payments; the handler treats a payload without `kind` as `late_paid`.

- [ ] **Step 1: Write the failing tests.**
  - `email-templates.test.ts`: placeholders filled and HTML-escaped (`<b>` in a name arrives as `&lt;b&gt;`); `renderOrderEmail("paid", …)` contains the order link and the refund policy; no identity number appears for an order whose answers include one.
  - `mask.test.ts`: the two examples above plus a short value.
  - `worker-jobs.test.ts` (provider and Midtrans mocked):
    - `email job sends and logs`; `failed send logs and rethrows`.
    - `payment-check without midtrans transaction expires order` (Review Focus 5): the order is `expired`, and `runOnce` marks the job `done`.
    - `payment-check pending after deadline expires at midtrans first`: `expireTransaction` is called before the order becomes `expired`.
    - `payment-check settlement pays late order`: after the sweeper expired the hold, Get Status `settlement` gives `paid` (quota left) or `late_paid_review` (quota gone).
    - `reconcile fixes drift and alerts`: an injected `held += 1` is fixed and an `admin-alert:drift:*` job exists.
- [ ] **Step 2: Run** `npm test` and `npm run test:db -- worker-jobs`. Expected: FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run** both. Expected: PASS. Then run `npm run worker` against the dev database for one minute and check that it starts, enqueues one `reconcile` job, and stops cleanly on Ctrl+C.
- [ ] **Step 5: Commit:** `feat(worker): order emails, payment check, hourly reconciliation, admin alerts`.

### Task 7: Email templates in the panel

**Files:**
- Create: `src/app/admin/(panel)/settings/templates/page.tsx`, `src/app/admin/(panel)/settings/templates/templates-form.tsx`
- Modify: `src/lib/validation/settings.ts` (`emailTemplatesInput`), `src/lib/settings-service.ts` (group `email_templates`), `src/app/api/admin/settings/[group]/route.ts`, `src/app/admin/(panel)/settings/settings-nav.tsx`
- Test: `tests/db/settings.test.ts` (extend)

**Interfaces:**
- Consumes: `DEFAULT_EMAIL_TEMPLATES`, `EMAIL_PLACEHOLDERS`, `renderOrderEmail` (Task 6).
- Produces: `GET/PUT /api/admin/settings/email_templates` with `{ [type]: { subject (1–150), body (1–2000) } }`. A placeholder outside `EMAIL_PLACEHOLDERS` gives 422 on that field: "Placeholder {{x}} tidak dikenal." The page shows one card per email type ("Menunggu pembayaran", "Pembayaran berhasil", "Pesanan kedaluwarsa", "Pembayaran terlambat") with subject, paragraph, the placeholder list, "Kembalikan ke bawaan", and a preview rendered with sample data in a sandboxed `<iframe srcdoc>`.

- [ ] **Step 1: Write the failing test** `email templates round trip and reject unknown placeholders`. **Run** `npm run test:db -- settings`. Expected: FAIL.
- [ ] **Step 2: Implement** the schema, service group, route and page. **Run** the test. Expected: PASS.
- [ ] **Step 3: Verify in the browser** (Playwright, 375 px and 1280 px, light and dark): edit a subject, save, reload, preview updates; an unknown placeholder shows the field error; contrast checked.
- [ ] **Step 4: Commit:** `feat(admin): editable email templates with preview`.

### Task 8: Booking UI: "Beli Sekarang" and `/checkout/{holdId}`

**Files:**
- Create: `src/components/turnstile-widget.tsx`, `src/components/countdown.tsx`, `src/lib/booking/countdown.ts`, `src/app/(public)/checkout/[holdId]/page.tsx`, `src/app/(public)/checkout/[holdId]/checkout-flow.tsx`
- Modify: `src/app/(public)/events/[slug]/tickets/ticket-picker.tsx`
- Test: `tests/unit/countdown.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 4 endpoints, `requestJson`, `DynamicFormFields`, `Dialog`, `Button`, `Field`, `formatRupiah`.
- Produces:
  - `remainingMs(expiresAt: string, serverNow: string, receivedAt: number, now: number): number` = `max(0, (expiresAt - serverNow) - (now - receivedAt))`.
  - `<TurnstileWidget siteKey onToken(token) ref>` exposing `reset()`; loads the script once.
  - `<Countdown expiresAt serverNow receivedAt onExpire>`: `mm:ss`, `aria-live="polite"` announcing whole minutes only, warning colour below 60 s.
  - Ticket picker: "Beli Sekarang" is enabled when at least one ticket is chosen; it shows the Turnstile widget above the button; it sends `POST /api/holds` with a new `Idempotency-Key` (`crypto.randomUUID()`) per selection, reused on retries of the same selection; it disables itself while the request runs; on 201 it stores the selection in `sessionStorage["anytix:selection:<eventId>"]` and goes to `/checkout/<holdId>`; on 409 `SOLD_OUT` it shows the message and lowers that category's quantity to `available`; it resets the widget after every failure. Returning to the page restores the stored selection.
  - `/checkout/[holdId]` (server page, `noindex`): inside `<Suspense>` it reads `vid` and `getHoldView`; a missing hold renders "Pesanan tidak ditemukan." with a link back to `/events`; a hold that already has an order redirects to `/orders/<uuid>`; otherwise it renders `CheckoutFlow` with the view and `serverNow`.
  - `CheckoutFlow` (client):
    - Header stepper with step 2 or 3 current.
    - Step 2 "Detail Pesanan": event summary, card "Data Pemesan" (Nama Lengkap, Email, No. WhatsApp with a country code select defaulting to +62), then `DynamicFormFields` for the event fields. The draft is saved to `sessionStorage["anytix:draft:<eventId>"]` on every change and restored on load. "Lanjutkan" validates on the client (same zod schemas) and opens "Konfirmasi Pesanan" (name, email, WhatsApp, the "Informasi Penting" text from PRD §8, "Edit Data" / "Saya Mengerti").
    - Step 3 "Metode Pembayaran": accordion QRIS and Transfer Bank (enabled banks only), sidebar with items, subtotal, "Biaya Layanan", "Total Bayar" from `POST /quote`, checkboxes for S&K and "Kebijakan Privasi & Pemrosesan Data" (the label names the check-in identity purpose and the 60-day retention when `hasIdentityField`), Turnstile, and "Bayar Sekarang" (disabled until a method is chosen and both boxes are ticked). Success navigates to `/orders/<uuid>`; 422 field errors return to step 2 with errors next to the fields; 410 opens the time-out modal.
    - Sidebar countdown "Batas Waktu Tersisa" on both steps; at zero, the modal "Waktu habis, slot dilepas" with "Pilih ulang tiket" (to `/events/<slug>/tickets`); the draft stays.
    - The back button (‹) on step 2 asks "Batalkan pilihan tiket?", then `DELETE /api/holds/<id>` and goes to the tickets page, where the stored selection is restored.

- [ ] **Step 1: Load** `antislop:antislop`, `antislop:antislop-ui`, `antislop:antislop-copywriting`, `antislop:antislop-human`, `antislop:antislop-layoutmobile`.
- [ ] **Step 2: Write the failing test** `tests/unit/countdown.test.ts` `countdown ignores device clock offset` (Review Focus 2): a device clock 30 s fast or slow gives the same remaining time; never negative. **Run** `npm test`. Expected: FAIL. **Implement** `countdown.ts`. **Run**. Expected: PASS.
- [ ] **Step 3: Implement** the components, the ticket picker change and the checkout page.
- [ ] **Step 4: Run** `npm run build`. Expected: success; `/checkout/[holdId]` is dynamic; no "uncached data outside Suspense" error.
- [ ] **Step 5: Verify in the browser** against `npm run start` (Playwright, 375 px and 1280 px, light and dark):
  - Pick 2 tickets, "Beli Sekarang", land on step 2 with the countdown running from `hold_minutes`.
  - Leave a required field empty, "Lanjutkan" shows the error next to it; fill, confirm in the modal, reach step 3.
  - "Bayar Sekarang" stays disabled until a method and both boxes are set.
  - Force `expires_at` into the past in the DB, then click "Bayar Sekarang": the time-out modal appears, "Pilih ulang tiket" returns to the tickets page with the previous quantities, and the draft fills step 2 again on the next hold (Review Focus 3).
  - Back button flow releases the hold (`held` back to 0).
  - Keyboard only: every control reachable, modals close with Escape, focus returns.
  - Contrast tool on every new pair; no console errors.
- [ ] **Step 6: Commit:** `feat(booking): buy button with turnstile and the checkout steps`.

### Task 9: Order page, order API and security headers

**Files:**
- Create: `src/lib/booking/order-view.ts`, `src/app/api/orders/[uuid]/route.ts`, `src/app/(public)/orders/[uuid]/page.tsx`, `src/app/(public)/orders/[uuid]/order-status.tsx`
- Modify: `next.config.ts` (`headers()`)
- Test: `tests/unit/order-view.test.ts`, `tests/db/orders-api.test.ts`

**Interfaces:**
- Consumes: `ensureSnapToken` via `POST /api/orders/{uuid}/pay` (Task 4), `snapScriptUrl`, `midtransClientKey` (Task 3), `Countdown` (Task 8).
- Produces:
  - `displayStatus(status: string, payExpiresAt: Date, now: Date): "PENDING" | "LUNAS" | "KEDALUWARSA" | "DIBATALKAN" | "DITINJAU" | "DIKEMBALIKAN"`: `awaiting_payment` past `pay_expires_at` shows KEDALUWARSA (design doc §3.3); `late_paid_review` shows DITINJAU; `refunded` shows DIKEMBALIKAN.
  - `getOrderView(uuid: string): Promise<OrderView | null>` with `{ uuid, invoice, status, displayStatus, payExpiresAt, serverNow, paymentMethod: { key, label }, buyerName, items, subtotal, discount, fee, total, event: { slug, title, startsAt, endsAt, timezone, venue, city }, hasSnapToken, tickets: Array<{ seq, categoryName }> (only when paid) }`. Never returns answers, identity, email or phone.
  - `GET /api/orders/{uuid}`: 200 `OrderView` or 404; invalid UUID gives 404 without a query; rate limit 60/min per IP; `no-store` and `referrer-policy: no-referrer`.
  - `/orders/[uuid]` (server page, `noindex`, params read inside `<Suspense>`), client `OrderStatus`:
    - PENDING: bar "Selesaikan Pembayaran" with countdown to `payExpiresAt`, "Silakan lakukan pembayaran sebelum {tanggal jam}", method, total, status, "ID Pesanan" (invoice), "Bayar Sekarang" loading `snap.js` with `data-client-key` and calling `window.snap.pay(token)`; Snap opens automatically once per order (flag in `localStorage["anytix:snap-opened:<uuid>"]`); polling `GET /api/orders/{uuid}` every 5 s while PENDING and visible.
    - LUNAS: ticket list "Tiket {seq} dari {N}" with category names and buyer name, plus the Fase 3 QR note.
    - KEDALUWARSA and DIBATALKAN: message and "Pesan lagi" to `/events/<slug>`.
    - DITINJAU: "Pembayaran Anda masuk setelah batas waktu. Pengelola akan menghubungi Anda untuk pengembalian dana." plus CS contact.
  - `next.config.ts` `headers()` in production only (`process.env.NODE_ENV === "production"`), for every path: `Content-Security-Policy` with `default-src 'self'`; `script-src 'self' 'unsafe-inline'` plus the Midtrans app host and `https://challenges.cloudflare.com`; `frame-src` the same hosts; `connect-src 'self'` plus the Midtrans hosts; `img-src 'self' data: blob:` plus the media base origin and Midtrans hosts; `style-src 'self' 'unsafe-inline'`; `font-src 'self'`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`. Also `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Strict-Transport-Security: max-age=31536000` when `APP_URL` is https. Design doc §3.6 `shortcut:` comment kept next to the CSP.

- [ ] **Step 1: Write the failing tests.**
  - `order-view.test.ts`: each `displayStatus` branch, including `awaiting_payment` one second after the deadline.
  - `orders-api.test.ts`: `pending order view has no personal data` (no email, phone or answers in the JSON); `paid order lists tickets` (Bundle ×1 gives 2 entries); `unknown uuid is 404`; `headers are no-store and no-referrer`.
- [ ] **Step 2: Run** `npm test` and `npm run test:db -- orders-api`. Expected: FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run** both. Expected: PASS. Run `npm run build`.
- [ ] **Step 5: Verify in the browser** against `npm run start` with the sandbox keys: checkout opens `/orders/<uuid>`, Snap opens once by itself, closing it and pressing "Bayar Sekarang" reopens the same token, no CSP violations in the console on the tickets, checkout and order pages (add any Midtrans host the console reports, then re-check). 375 px and 1280 px, light and dark, contrast tool, keyboard.
- [ ] **Step 6: Commit:** `feat(booking): order page with Snap, polling and security headers`.

### Task 10: Admin orders service and API

**Files:**
- Create: `src/lib/admin/order-admin-service.ts`, `src/app/api/admin/orders/route.ts`, `src/app/api/admin/orders/[id]/route.ts`, `src/app/api/admin/orders/[id]/cancel/route.ts`, `src/app/api/admin/orders/[id]/resend-email/route.ts`, `src/app/api/admin/orders/[id]/issue-tickets/route.ts`, `src/app/api/admin/orders/[id]/mark-refunded/route.ts`
- Test: `tests/db/admin-orders.test.ts`

**Interfaces:**
- Consumes: `adminRoute`, `writeAudit`, `maskIdentity`, `decrypt`, `cancelTransaction`, `applyPaymentStatus`, `enqueueJob`, Fase 0 `issue_late_order`.
- Produces:
  - `listAdminOrders(f: { q?: string; status?: string; eventId?: number; page: number }): Promise<{ items: AdminOrderRow[]; total: number; pageSize: 20 }>`: `q` matches invoice (case-insensitive), buyer email, buyer name (`ilike`, `%`/`_`/`\` escaped) or exact `public_uuid`; newest first.
  - `getAdminOrder(id: number)`: order, event title, items, payments (attempt, method, status, Midtrans order id), `payment_events` (status, time), `email_logs`, and answers with labels where identity shows `{ type, number: maskIdentity(decrypted) }`.
  - `cancelOrder(adminId, id)`: only `awaiting_payment` (else 409 "Hanya pesanan yang belum dibayar yang bisa dibatalkan."); calls `cancelTransaction` for the latest payment when it has a Snap token (404 ignored), then `applyPaymentStatus(…, "cancel", { source: "admin", admin_id })`; audit `cancel`.
  - `resendOrderEmail(adminId, id, input: { to?: string; updateBuyerEmail?: boolean })`: email type follows the status (awaiting_payment, paid, expired, late_paid_review → late_paid); other statuses give 409; `updateBuyerEmail` also updates `orders.buyer_email`; the job key is `email:<type>:<id>:resend:<ms>`; audit `resend_email`.
  - `issueLateTickets(adminId, id)`: calls `issue_late_order`; `SOLD_OUT` gives 409 "Kuota belum cukup. Naikkan kuota kategori tiket dulu."; `INVALID_STATE` gives 409; audit `issue_late`.
  - `markOrderRefunded(adminId, id)`: `update orders set status = 'refunded' where id = $1 and status = 'late_paid_review'`; 0 rows gives 409; audit `mark_refunded`.
  - `countLatePaid(): Promise<number>`.
  - Routes (PRD §20, plus two action routes): `GET /api/admin/orders?q=&status=&eventId=&page=`, `GET /api/admin/orders/{id}`, `POST …/cancel`, `POST …/resend-email` (body `{ to?, updateBuyerEmail? }`), `POST …/issue-tickets`, `POST …/mark-refunded`. The late-paid list is `GET /api/admin/orders?status=late_paid_review`.

- [ ] **Step 1: Write the failing tests** `tests/db/admin-orders.test.ts`:
  - `search finds by invoice, email and uuid`; `identity is masked in detail`.
  - `cancel releases slots and calls midtrans first` (call order asserted with mocks); `cancel paid order is 409`.
  - `resend queues a new email job each time` (two calls give two jobs); `resend to corrected email updates the order`.
  - `issue late tickets needs capacity`; `mark refunded only from review`.
  - `every action writes an audit row`.
- [ ] **Step 2: Run** `npm run test:db -- admin-orders`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test:db -- admin-orders`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(admin): orders search, detail, cancel, resend and late-paid actions`.

### Task 11: Admin orders UI and dashboard alert

**Files:**
- Create: `src/app/admin/(panel)/orders/page.tsx`, `src/app/admin/(panel)/orders/orders-table.tsx`, `src/app/admin/(panel)/orders/[id]/page.tsx`, `src/app/admin/(panel)/orders/[id]/order-actions.tsx`
- Modify: `src/app/admin/(panel)/layout.tsx` (nav "Pesanan"), `src/app/admin/(panel)/page.tsx` (late-paid banner)

**Interfaces:**
- Consumes: Task 10 routes, Fase 1 admin components.
- Produces:
  - `/admin/orders`: search box, status filter (all, Menunggu bayar, Lunas, Kedaluwarsa, Dibatalkan, Perlu tindak lanjut, Dikembalikan), event filter, responsive list (invoice, buyer name, event, total, status badge, created time), pagination, empty state.
  - `/admin/orders/[id]`: order summary, items, buyer, masked answers, payments and payment events timeline, email log, and actions shown only when valid: "Batalkan pesanan" (confirm dialog), "Kirim ulang email" (dialog with optional corrected email and "Simpan sebagai email pemesan"), "Terbitkan tiket" and "Tandai sudah direfund" for review orders (confirm dialogs).
  - Dashboard banner when `countLatePaid() > 0`: "{n} pesanan perlu tindak lanjut karena pembayaran terlambat." linking to the filtered list.

- [ ] **Step 1: Implement** the pages.
- [ ] **Step 2: Verify in the browser** (Playwright, 375 px and 1280 px, light and dark): search by invoice and by email, open a detail, cancel an unpaid order (status becomes Dibatalkan, inventory `held` drops), resend to a corrected email (new `email_logs` row after the worker runs), late-paid banner appears for an order put into `late_paid_review` by a test script, "Terbitkan tiket" after raising capacity. Keyboard, contrast tool, no console errors.
- [ ] **Step 3: Commit:** `feat(admin): orders list, detail actions and late payment banner`.

### Task 12: Sandbox end-to-end and Fase 2 checkpoint

- [ ] **Step 1: Start a tunnel** for the webhook: `ngrok http 3000` (needs an authtoken; otherwise `cloudflared tunnel --url http://localhost:3000`). Put `https://<tunnel>/api/webhooks/midtrans` in `MIDTRANS_NOTIFICATION_URL` in `.env.local`; tell the owner the URL changes on each restart. Run `npm run build`, `npm run start` and `npm run worker`.
- [ ] **Step 2: End-to-end in the sandbox** (Playwright plus the Midtrans simulator at `https://simulator.sandbox.midtrans.com`):
  - QRIS: pick tickets, checkout, Snap shows the QR, pay in the simulator, the order page turns LUNAS within one poll, `email:paid` is sent (check `email_logs` and the inbox).
  - BCA VA and Mandiri bill payment: same, paying with the VA number / company code in the simulator.
  - Hold timeout at step 2 with `hold_minutes` 1 (restore 3 afterwards).
  - Snap closed then reopened: same token.
  - Duplicate webhook: replay the last notification with `curl` (body copied from `payment_events.payload`, signature recomputed): 200 and no change.
  - Late webhook: let an order pass `pay_expires_at` plus grace without paying, confirm the sweeper (`cron.job` `sweep-expired-holds`) released the slot and `payment-check` expired it at Midtrans and locally; then confirm a settlement for an expired order (simulate via `applyPaymentStatus` from a test script if the simulator refuses expired transactions) ends `paid` or `late_paid_review` as quota allows.
- [ ] **Step 3: Checks.** `npm test`, `npm run test:db` (including the Fase 0 300-reserver test), `npm run lint`, `npm run build`. curl: `/checkout/x` and `/api/holds` responses are `no-store`; `/api/orders/<uuid>` has `referrer-policy: no-referrer`; public pages still have `s-maxage=60` and no `set-cookie`; production CSP present.
- [ ] **Step 4: AGENTS.md comment check** (Fase 0 Task 10 grep) and the antislop Delivery Gate for the checkout, order and admin order pages (report in `anti-slop/`).
- [ ] **Step 5: Whole-phase review** by a fresh reviewer; fix Critical/Important with RED→GREEN tests.
- [ ] **Step 6: Clean up** test orders, holds, admins and events created during verification (FK order in HANDOFF), restore settings, update `docs/superpowers/HANDOFF.md` for Fase 3, commit, push to `main`, report to the owner in Indonesian.
