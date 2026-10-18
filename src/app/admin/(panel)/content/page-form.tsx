"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PagesView } from "@/lib/settings-service";
import { useSettings } from "../settings/use-settings";

const PAGES = {
  about: { label: "Isi halaman Tentang Kami", path: "/about", saved: "Halaman Tentang Kami disimpan." },
  contact: { label: "Isi halaman Hubungi Kami", path: "/contact", saved: "Halaman Hubungi Kami disimpan." },
} as const;

export function PageForm({ page }: { page: keyof PagesView }) {
  const { data, setData, loadError, errors, formError, notice, saving, save } = useSettings<PagesView>("pages");
  const meta = PAGES[page];

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!data) return <Skeleton className="mt-6 h-96" />;
  const form = data;

  async function submit(e: FormEvent) {
    e.preventDefault();
    await save(form);
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-5">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
        <RichTextEditor
          id={`page-${page}`}
          label={meta.label}
          imageKind="page"
          value={form[page]}
          error={errors[page]}
          onChange={(v) => setData({ ...form, [page]: v })}
        />
      </section>
      {formError && <Alert>{formError}</Alert>}
      {notice && <Alert tone="success">{meta.saved}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={saving}>
          Simpan halaman
        </Button>
        <Link href={meta.path} target="_blank" rel="noopener" className="text-sm font-semibold text-accent-text underline underline-offset-4">
          Lihat halaman
          <span className="sr-only"> (tab baru)</span>
        </Link>
      </div>
    </form>
  );
}
