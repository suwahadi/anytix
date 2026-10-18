"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Countdown } from "@/components/countdown";
import { DynamicFormFields, type AnswerValues } from "@/components/dynamic-form-fields";
import { TurnstileWidget, type TurnstileHandle } from "@/components/turnstile-widget";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/field";
import { buyerInput, COUNTRY_CODES, normalizePhone } from "@/lib/booking/buyer";
import type { HoldView, Quote } from "@/lib/booking/hold-view";
import { requestJson } from "@/lib/client-fetch";
import { buildAnswersSchema } from "@/lib/form-schema";
import { formatEventSchedule, formatRupiah } from "@/lib/format";
import type { Timezone } from "@/lib/validation/catalog";

type Buyer = { name: string; email: string; countryCode: string; phone: string };
type Draft = { buyer: Buyer; answers: AnswerValues };

const EMPTY: Draft = { buyer: { name: "", email: "", countryCode: "62", phone: "" }, answers: {} };
const STEPS = ["Pilih Tiket", "Detail Pesanan", "Metode Pembayaran", "Pembayaran"];
const noSubscription = () => () => {};

function readStored(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function issuesToFields(issues: Array<{ path: PropertyKey[]; message: string }>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) out[`${prefix}${i.path.map(String).join(".")}`] ??= i.message;
  return out;
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li key={label} aria-current={state === "current" ? "step" : undefined} className="flex items-center gap-2">
            <span
              className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                state === "todo" ? "border border-border-strong text-muted" : "bg-accent text-on-accent"
              }`}
            >
              {n}
            </span>
            <span className={state === "current" ? "font-semibold text-text" : "text-muted"}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function CheckoutFlow({ view, siteKey }: { view: HoldView; siteKey: string }) {
  const router = useRouter();
  const uid = useId();
  const draftKey = `anytix:draft:${view.event.id}`;
  const storedDraft = useSyncExternalStore(noSubscription, () => readStored(draftKey), () => null);
  const restored = useMemo<Draft>(() => {
    try {
      return storedDraft ? { ...EMPTY, ...(JSON.parse(storedDraft) as Draft) } : EMPTY;
    } catch {
      return EMPTY;
    }
  }, [storedDraft]);
  const [edited, setEdited] = useState<Draft | null>(null);
  const draft = edited ?? restored;

  const [receivedAt] = useState(() => Date.now());
  const [step, setStep] = useState<2 | 3>(2);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [backOpen, setBackOpen] = useState(false);
  const [expired, setExpired] = useState(view.status !== "held");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [method, setMethod] = useState("");
  const [consents, setConsents] = useState({ terms: false, privacy: false });
  const [token, setToken] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [releasing, setReleasing] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [promoError, setPromoError] = useState("");
  const [applying, setApplying] = useState(false);
  const turnstile = useRef<TurnstileHandle>(null);
  const form = useRef<HTMLFormElement>(null);

  // Next keeps this page's state while the buyer is on /orders; start fresh when they come back.
  useEffect(
    () => () => {
      setPaying(false);
      setToken("");
    },
    [],
  );

  const tz = view.event.timezone as Timezone;
  const schedule = formatEventSchedule(new Date(view.event.startsAt), new Date(view.event.endsAt), tz);
  const subtotal = view.items.reduce((s, i) => s + i.lineTotal, 0);
  const totals = quote ?? { subtotal, discount: 0, fee: view.serviceFee, total: subtotal + view.serviceFee };
  const ticketsUrl = `/events/${view.event.slug}/tickets`;

  function update(next: Draft) {
    setEdited(next);
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(next));
    } catch {}
  }

  function validate(): boolean {
    const buyer = buyerInput.safeParse(draft.buyer);
    const answers = buildAnswersSchema(view.fields).safeParse(draft.answers);
    const next = {
      ...(buyer.success ? {} : issuesToFields(buyer.error.issues)),
      ...(answers.success ? {} : issuesToFields(answers.error.issues)),
    };
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function continueToConfirm(e: FormEvent) {
    e.preventDefault();
    if (validate()) setConfirmOpen(true);
    else requestAnimationFrame(() => form.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
  }

  async function goToPayment() {
    setConfirmOpen(false);
    setStep(3);
    window.scrollTo({ top: 0 });
    const res = await requote(promoCode);
    if (res.ok) setQuote(res.data);
  }

  async function requote(voucherCode: string | null) {
    const res = await requestJson<Quote>(`/api/holds/${view.id}/quote`, { body: voucherCode ? { voucherCode } : {} });
    if (!res.ok && res.status === 410) setExpired(true);
    return res;
  }

  async function applyPromo(e: FormEvent) {
    e.preventDefault();
    const code = promoInput.trim();
    if (!code) return setPromoError("Masukkan kode promo.");
    setApplying(true);
    setPromoError("");
    const res = await requote(code);
    setApplying(false);
    if (!res.ok) return setPromoError(res.error);
    if (res.data.voucherError) return setPromoError(res.data.voucherError);
    setQuote(res.data);
    setPromoCode(res.data.voucherCode);
    setPayError("");
    setPromoOpen(false);
  }

  async function removePromo() {
    setPromoCode(null);
    setPromoInput("");
    const res = await requote(null);
    setQuote(res.ok ? res.data : null);
  }

  async function release() {
    setReleasing(true);
    await requestJson(`/api/holds/${view.id}`, { method: "DELETE" });
    router.push(ticketsUrl);
  }

  async function pay() {
    setPaying(true);
    setPayError("");
    const res = await requestJson<{ orderUuid: string }>(`/api/holds/${view.id}/checkout`, {
      body: { turnstileToken: token, buyer: draft.buyer, answers: draft.answers, paymentMethod: method, consents, voucherCode: promoCode ?? undefined },
    });
    if (res.ok) {
      try {
        sessionStorage.removeItem(draftKey);
        sessionStorage.removeItem(`anytix:selection:${view.event.id}`);
      } catch {}
      router.push(`/orders/${res.data.orderUuid}`);
      return;
    }
    setPaying(false);
    setToken("");
    turnstile.current?.reset();
    if (res.status === 410) return setExpired(true);
    if (res.body?.code === "VOUCHER") {
      await removePromo();
      return setPayError("Kode promo tidak bisa dipakai lagi. Total sudah diperbarui.");
    }
    const fields = res.fields ?? {};
    const formFields = Object.fromEntries(
      Object.entries(fields)
        .filter(([k]) => k.startsWith("buyer.") || k.startsWith("answers."))
        .map(([k, v]) => [k.replace(/^(buyer|answers)\./, ""), v]),
    );
    if (Object.keys(formFields).length > 0) {
      setErrors(formFields);
      setStep(2);
      return;
    }
    setPayError(fields.consents ?? fields.paymentMethod ?? res.error);
  }

  const canPay = Boolean(method && consents.terms && consents.privacy && token);
  const banks = view.paymentMethods.filter((m) => m.group === "va");
  const qris = view.paymentMethods.find((m) => m.group === "qris");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:py-10">
      <Stepper current={step} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-10">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => (step === 3 ? setStep(2) : setBackOpen(true))}
              aria-label={step === 3 ? "Kembali ke detail pesanan" : "Batalkan pilihan tiket"}
              className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-2xl text-text hover:bg-surface-muted"
            >
              ‹
            </button>
            <div className="min-w-0 pt-1.5">
              <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-text">{step === 2 ? "Detail Pesanan" : "Metode Pembayaran"}</h1>
              <p className="mt-1 text-sm text-muted">
                {view.event.title} · {schedule.date}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 lg:hidden">
            <span className="text-sm font-semibold text-text">Batas Waktu Tersisa</span>
            <Countdown expiresAt={view.expiresAt} serverNow={view.serverNow} receivedAt={receivedAt} onExpire={() => setExpired(true)} />
          </div>

          {step === 2 ? (
            <form ref={form} onSubmit={continueToConfirm} noValidate className="flex flex-col gap-5">
              <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
                <h2 className="text-lg font-bold text-text">Data Pemesan</h2>
                <Field
                  id={`${uid}-name`}
                  label="Nama Lengkap *"
                  autoComplete="name"
                  value={draft.buyer.name}
                  error={errors.name}
                  onChange={(e) => update({ ...draft, buyer: { ...draft.buyer, name: e.target.value } })}
                />
                <Field
                  id={`${uid}-email`}
                  label="Email *"
                  type="email"
                  autoComplete="email"
                  hint="Invoice dan e-ticket dikirim ke email ini."
                  value={draft.buyer.email}
                  error={errors.email}
                  onChange={(e) => update({ ...draft, buyer: { ...draft.buyer, email: e.target.value } })}
                />
                <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-3">
                  <Select
                    id={`${uid}-country`}
                    label="Kode negara"
                    value={draft.buyer.countryCode}
                    onChange={(e) => update({ ...draft, buyer: { ...draft.buyer, countryCode: e.target.value } })}
                    options={COUNTRY_CODES.map((c) => ({ value: c.code, label: c.label }))}
                  />
                  <Field
                    id={`${uid}-phone`}
                    label="No. WhatsApp *"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    value={draft.buyer.phone}
                    error={errors.phone}
                    onChange={(e) => update({ ...draft, buyer: { ...draft.buyer, phone: e.target.value } })}
                  />
                </div>
                {view.fields.length > 0 && (
                  <div className="flex flex-col gap-4 border-t border-border pt-4">
                    <DynamicFormFields
                      idPrefix={`${uid}-answer`}
                      fields={view.fields}
                      values={draft.answers}
                      errors={errors}
                      onChange={(key, value) => update({ ...draft, answers: { ...draft.answers, [key]: value } })}
                    />
                  </div>
                )}
              </section>
              <Button type="submit" className="self-stretch sm:self-start">
                Lanjutkan
              </Button>
            </form>
          ) : (
            <section className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-4 sm:p-5">
              {qris && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-lg font-bold text-text">QRIS</legend>
                  <MethodOption uid={uid} id={qris.key} label="QRIS (semua e-wallet dan m-banking)" checked={method === qris.key} onSelect={setMethod} />
                </fieldset>
              )}
              {banks.length > 0 && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-lg font-bold text-text">Transfer Bank</legend>
                  {banks.map((b) => (
                    <MethodOption key={b.key} uid={uid} id={b.key} label={`Virtual Account ${b.label}`} checked={method === b.key} onSelect={setMethod} />
                  ))}
                </fieldset>
              )}
            </section>
          )}
        </div>

        <aside className="lg:col-start-2 lg:row-start-1">
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5 lg:sticky lg:top-6">
            <div className="hidden items-center justify-between gap-3 rounded-md bg-surface-muted px-3 py-2 lg:flex">
              <span className="text-sm font-semibold text-text">Batas Waktu Tersisa</span>
              <Countdown expiresAt={view.expiresAt} serverNow={view.serverNow} receivedAt={receivedAt} onExpire={() => setExpired(true)} />
            </div>
            <h2 className="text-lg font-bold text-text">Rincian Pesanan</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {view.items.map((i) => (
                <li key={i.inventoryId} className="flex justify-between gap-3">
                  <span className="min-w-0 text-text">
                    {i.name} × {i.qty}
                  </span>
                  <span className="shrink-0 font-semibold text-text">{formatRupiah(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="flex flex-col gap-1 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="text-text">{formatRupiah(totals.subtotal)}</dd>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted">Diskon{promoCode && ` (${promoCode})`}</dt>
                  <dd className="text-text">−{formatRupiah(totals.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted">Biaya Layanan</dt>
                <dd className="text-text">{formatRupiah(totals.fee)}</dd>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <dt className="font-semibold text-text">Total Bayar</dt>
                <dd className="text-xl font-extrabold text-accent-text">{formatRupiah(totals.total)}</dd>
              </div>
            </dl>
            {step === 3 && (
              <div className="flex flex-col gap-3 border-t border-border pt-4">
                {promoCode ? (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-text">
                      Promo <strong>{promoCode}</strong> dipakai.
                    </span>
                    <Button variant="ghost" size="sm" onClick={removePromo}>
                      Hapus promo
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      setPromoError("");
                      setPromoOpen(true);
                    }}
                  >
                    Lebih hemat pakai promo
                  </Button>
                )}
                <Consent
                  id={`${uid}-terms`}
                  checked={consents.terms}
                  onChange={(v) => setConsents({ ...consents, terms: v })}
                  label="Saya menyetujui Syarat & Ketentuan."
                  link={{ href: "/terms", text: "Baca Syarat & Ketentuan" }}
                />
                <Consent
                  id={`${uid}-privacy`}
                  checked={consents.privacy}
                  onChange={(v) => setConsents({ ...consents, privacy: v })}
                  label={`Saya menyetujui Kebijakan Privasi & Pemrosesan Data${
                    view.hasIdentityField
                      ? ", termasuk pemrosesan nomor identitas untuk verifikasi identitas pemesan saat check-in. Nomor identitas dihapus 60 hari setelah acara berakhir."
                      : "."
                  }`}
                  link={{ href: "/privacy", text: "Baca Kebijakan Privasi" }}
                />
                <TurnstileWidget ref={turnstile} siteKey={siteKey} onToken={setToken} />
                {payError && <Alert>{payError}</Alert>}
                <Button onClick={pay} loading={paying} disabled={!canPay} className="w-full" aria-describedby={`${uid}-pay-note`}>
                  Bayar Sekarang
                </Button>
                <p id={`${uid}-pay-note`} className="text-sm text-muted">
                  {method ? "Pembayaran dibuka di halaman berikutnya." : "Pilih metode pembayaran dan centang kedua persetujuan."}
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>

      <Dialog open={promoOpen} onClose={() => setPromoOpen(false)} title="Kode Promo">
        <form onSubmit={applyPromo} className="flex flex-col gap-3" noValidate>
          <Field
            id={`${uid}-promo`}
            label="Kode promo"
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value)}
            error={promoError || undefined}
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={40}
          />
          <p className="text-sm text-muted">Diskon berlaku untuk harga tiket. Biaya layanan tidak didiskon.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPromoOpen(false)}>
              Batal
            </Button>
            <Button type="submit" loading={applying}>
              Pakai
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Konfirmasi Pesanan"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Edit Data
            </Button>
            <Button onClick={goToPayment}>Saya Mengerti</Button>
          </div>
        }
      >
        <dl className="flex flex-col gap-2 text-sm">
          <div>
            <dt className="text-muted">Nama</dt>
            <dd className="font-semibold text-text">{draft.buyer.name}</dd>
          </div>
          <div>
            <dt className="text-muted">Email</dt>
            <dd className="break-all font-semibold text-text">{draft.buyer.email}</dd>
          </div>
          <div>
            <dt className="text-muted">No. WhatsApp</dt>
            <dd className="font-semibold text-text">+{normalizePhone(draft.buyer.countryCode, draft.buyer.phone) ?? draft.buyer.phone}</dd>
          </div>
        </dl>
        <div className="mt-4 rounded-md bg-surface-muted p-3 text-sm text-text">
          <p className="font-semibold">Informasi Penting</p>
          <p className="mt-1">Invoice dan e-ticket dikirim ke email di atas. Cek folder spam bila belum masuk.</p>
        </div>
      </Dialog>

      <Dialog
        open={backOpen}
        onClose={() => setBackOpen(false)}
        title="Batalkan pilihan tiket?"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setBackOpen(false)}>
              Lanjutkan pesanan
            </Button>
            <Button onClick={release} loading={releasing}>
              Ya, batalkan
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text">Slot tiket Anda akan dilepas untuk pembeli lain. Data yang sudah diisi tetap tersimpan di perangkat ini.</p>
      </Dialog>

      <Dialog
        open={expired}
        onClose={() => setExpired(false)}
        title="Waktu habis, slot dilepas"
        footer={
          <Link href={ticketsUrl} className={buttonClass()}>
            Pilih ulang tiket
          </Link>
        }
      >
        <p className="text-sm text-text">Batas waktu pengisian sudah lewat, jadi tiket yang Anda pilih dilepas. Data yang sudah diisi tetap tersimpan, silakan pilih tiket lagi.</p>
      </Dialog>
    </div>
  );
}

function MethodOption({ uid, id, label, checked, onSelect }: { uid: string; id: string; label: string; checked: boolean; onSelect: (key: string) => void }) {
  return (
    <label
      htmlFor={`${uid}-method-${id}`}
      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm font-medium text-text ${
        checked ? "border-accent bg-accent-soft" : "border-border-strong hover:bg-surface-muted"
      }`}
    >
      <input id={`${uid}-method-${id}`} type="radio" name={`${uid}-payment-method`} checked={checked} onChange={() => onSelect(id)} className="size-5 accent-accent" />
      {label}
    </label>
  );
}

function Consent({
  id,
  label,
  link,
  checked,
  onChange,
}: {
  id: string;
  label: ReactNode;
  link: { href: string; text: string };
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-accent" />
      <div className="flex flex-col">
        <label htmlFor={id} className="text-sm text-text">
          {label}
        </label>
        <Link href={link.href} target="_blank" className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent-text underline underline-offset-4">
          {link.text}
        </Link>
      </div>
    </div>
  );
}
