"use client";

import type { FormEvent } from "react";
import { ImageUpload } from "@/components/image-upload";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import type { SiteView } from "@/lib/settings-service";
import { useSettings } from "../use-settings";

export function SiteForm() {
  const { data, setData, loadError, errors, formError, notice, saving, save } = useSettings<SiteView>("site");

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!data) return <Skeleton className="mt-6 h-96" />;
  const form = data;
  const set = <K extends keyof SiteView>(key: K, value: SiteView[K]) => setData({ ...form, [key]: value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    await save(form);
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 flex max-w-3xl flex-col gap-5">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-lg font-bold text-text">Identitas situs</h2>
        <Field id="name" label="Nama situs" value={form.name} error={errors.name} onChange={(e) => set("name", e.target.value)} />
        <ImageUpload kind="logo" label="Logo" hint="Kosongkan untuk memakai nama situs sebagai logo." value={form.logoPath} onChange={(v) => set("logoPath", v)} />
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
        <div>
          <h2 className="text-lg font-bold text-text">Kontak layanan pelanggan</h2>
          <p className="mt-1 text-sm text-muted">Tampil di footer dan email tiket.</p>
        </div>
        <Field
          id="csWhatsapp"
          label="WhatsApp"
          hint="Contoh: 0812 3456 7890 atau +62 812 3456 7890."
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={form.csWhatsapp}
          error={errors.csWhatsapp}
          onChange={(e) => set("csWhatsapp", e.target.value)}
        />
        <Field id="csEmail" label="Email" type="email" value={form.csEmail} error={errors.csEmail} onChange={(e) => set("csEmail", e.target.value)} />
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-lg font-bold text-text">Halaman legal</h2>
        <RichTextEditor id="terms" label="Syarat & ketentuan" value={form.terms} error={errors.terms} onChange={(v) => set("terms", v)} />
        <RichTextEditor id="privacy" label="Kebijakan privasi" value={form.privacy} error={errors.privacy} onChange={(v) => set("privacy", v)} />
        {form.privacyUpdatedAt && (
          <p className="text-sm text-muted">
            Kebijakan privasi terakhir diubah {new Date(form.privacyUpdatedAt).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })}.
          </p>
        )}
      </section>

      {formError && <Alert>{formError}</Alert>}
      {notice && <Alert tone="success">Pengaturan situs disimpan.</Alert>}
      <Button type="submit" loading={saving} className="self-start">
        Simpan pengaturan situs
      </Button>
    </form>
  );
}
