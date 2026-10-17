"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, TextArea } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { renderOrderEmail, type OrderEmailData } from "@/lib/email/render-order-email";
import { DEFAULT_EMAIL_TEMPLATES, EMAIL_PLACEHOLDERS, EMAIL_TYPE_LABELS, EMAIL_TYPES, type EmailTemplates, type EmailType } from "@/lib/email/templates";
import { useSettings } from "../use-settings";

const SAMPLE: OrderEmailData = {
  invoice: "A7K2M9QXD",
  publicUuid: "00000000-0000-4000-8000-000000000000",
  buyerName: "Budi Santoso",
  buyerEmail: "budi@contoh.id",
  total: 205000,
  payExpiresAt: new Date(Date.now() + 15 * 60_000),
  paymentMethodLabel: "QRIS",
  items: [{ name: "Reguler", qty: 2, lineTotal: 200000 }],
  event: {
    title: "Contoh Event",
    slug: "contoh-event",
    startsAt: new Date(Date.now() + 7 * 86_400_000),
    endsAt: new Date(Date.now() + 7 * 86_400_000 + 3 * 3_600_000),
    timezone: "Asia/Jakarta",
    venue: "Gedung Contoh",
    city: "Jakarta",
    refundPolicy: "Contoh kebijakan refund event.",
  },
  site: { name: "Anytix", csWhatsapp: "6281234567890", csEmail: "cs@contoh.id" },
  appUrl: typeof window === "undefined" ? "" : window.location.origin,
};

const PLACEHOLDER_HINT = `Placeholder: ${EMAIL_PLACEHOLDERS.map((p) => `{{${p}}}`).join(", ")}`;

function Preview({ type, templates }: { type: EmailType; templates: EmailTemplates }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)} className="rounded-md border border-border">
      <summary className="cursor-pointer px-3 py-3 text-sm font-semibold text-text">Lihat pratinjau</summary>
      {open && (
        <iframe
          title={`Pratinjau email ${EMAIL_TYPE_LABELS[type]}`}
          sandbox=""
          srcDoc={renderOrderEmail(type, SAMPLE, templates).html}
          className="h-[30rem] w-full border-t border-border bg-white"
        />
      )}
    </details>
  );
}

export function TemplatesForm() {
  const { data, setData, loadError, errors, formError, notice, saving, save } = useSettings<EmailTemplates>("email_templates");

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!data) return <Skeleton className="mt-6 h-96" />;
  const templates = data;

  function edit(type: EmailType, key: "subject" | "body", value: string) {
    setData({ ...templates, [type]: { ...templates[type], [key]: value } });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    await save(templates);
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 flex max-w-3xl flex-col gap-5">
      <p className="text-sm text-muted">
        Subjek dan paragraf pembuka bisa diubah. Rincian pesanan, tombol, dan kontak ditambahkan otomatis. {PLACEHOLDER_HINT}.
      </p>
      {EMAIL_TYPES.map((type) => (
        <section key={type} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-text">{EMAIL_TYPE_LABELS[type]}</h2>
            <Button type="button" variant="ghost" onClick={() => setData({ ...templates, [type]: DEFAULT_EMAIL_TEMPLATES[type] })}>
              Kembalikan ke bawaan
            </Button>
          </div>
          <Field id={`${type}-subject`} label="Subjek" value={templates[type].subject} error={errors[`${type}.subject`]} onChange={(e) => edit(type, "subject", e.target.value)} />
          <TextArea id={`${type}-body`} label="Paragraf pembuka" rows={4} value={templates[type].body} error={errors[`${type}.body`]} onChange={(e) => edit(type, "body", e.target.value)} />
          <Preview type={type} templates={templates} />
        </section>
      ))}
      {formError && <Alert>{formError}</Alert>}
      {notice && <Alert tone="success">Templat email disimpan.</Alert>}
      <Button type="submit" loading={saving} className="self-start">
        Simpan templat email
      </Button>
    </form>
  );
}
