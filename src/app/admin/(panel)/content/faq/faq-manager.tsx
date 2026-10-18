"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PencilIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { RichTextEditor } from "@/components/rich-text-editor";
import { SortableList } from "@/components/sortable-list";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ICON_ONLY_ON_PHONE } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { requestJson } from "@/lib/client-fetch";
import type { Faq } from "@/lib/content/faq-service";

type Draft = { id?: number; question: string; answer: string; isActive: boolean };

const EMPTY: Draft = { question: "", answer: "", isActive: true };
const fetchFaqs = () => requestJson<{ faqs: Faq[] }>("/api/admin/faqs");
/** One-line preview only; importing the sanitizer module here would ship sanitize-html to the browser. */
const preview = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export function FaqManager() {
  const [faqs, setFaqs] = useState<Faq[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<Faq | null>(null);
  const [removeError, setRemoveError] = useState("");

  useEffect(() => {
    let active = true;
    fetchFaqs().then((res) => {
      if (!active) return;
      if (res.ok) setFaqs(res.data.faqs);
      else setLoadError(res.error);
    });
    return () => {
      active = false;
    };
  }, []);

  async function reload() {
    setLoadError("");
    const res = await fetchFaqs();
    if (res.ok) setFaqs(res.data.faqs);
    else setLoadError(res.error);
  }

  function openDraft(faq?: Faq) {
    setFieldErrors({});
    setFormError("");
    setDraft(faq ? { id: faq.id, question: faq.question, answer: faq.answer, isActive: faq.isActive } : EMPTY);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setFieldErrors({});
    setFormError("");
    const body = { question: draft.question, answer: draft.answer, isActive: draft.isActive };
    const res = draft.id ? await requestJson(`/api/admin/faqs/${draft.id}`, { method: "PATCH", body }) : await requestJson("/api/admin/faqs", { body });
    setSaving(false);
    if (!res.ok) {
      setFieldErrors(res.fields ?? {});
      return setFormError(res.error);
    }
    setNotice(draft.id ? "Pertanyaan disimpan." : "Pertanyaan ditambahkan.");
    setDraft(null);
    await reload();
  }

  async function reorder(ids: number[]) {
    if (!faqs) return;
    const previous = faqs;
    setFaqs(ids.map((id) => previous.find((f) => f.id === id)!));
    const res = await requestJson("/api/admin/faqs/reorder", { method: "PUT", body: { ids } });
    if (!res.ok) {
      setFaqs(previous);
      setNotice("");
      setLoadError(res.error);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setSaving(true);
    setRemoveError("");
    const res = await requestJson(`/api/admin/faqs/${removing.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) return setRemoveError(res.error);
    setNotice("Pertanyaan dihapus.");
    setRemoving(null);
    await reload();
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => openDraft()} aria-label="Tambah pertanyaan" title="Tambah pertanyaan" className={ICON_ONLY_ON_PHONE}>
          <PlusIcon className="size-5" />
          <span className="max-sm:sr-only">Tambah pertanyaan</span>
        </Button>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}

      {loadError && (
        <div className="flex flex-col items-start gap-3">
          <Alert>{loadError}</Alert>
          <Button variant="secondary" onClick={reload}>
            Muat ulang
          </Button>
        </div>
      )}

      {!faqs && !loadError && (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Memuat FAQ">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      )}

      {faqs?.length === 0 && (
        <p className="rounded-lg border border-dashed border-border-strong p-6 text-center text-muted">
          Belum ada pertanyaan. Tambahkan pertanyaan yang paling sering ditanyakan pembeli ke layanan pelanggan.
        </p>
      )}

      {faqs && faqs.length > 0 && (
        <SortableList
          items={faqs}
          getId={(f) => f.id}
          onReorder={reorder}
          className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
          renderItem={(f, handle) => (
            <div className="flex items-center gap-3 px-2 py-3 sm:px-3">
              {handle}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-text">
                  <span className="break-words">{f.question}</span>
                  {!f.isActive && <Badge>Tersembunyi</Badge>}
                </p>
                <p className="truncate text-sm text-muted">{preview(f.answer) || "Belum ada jawaban."}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" onClick={() => openDraft(f)} aria-label={`Ubah pertanyaan ${f.question}`} title="Ubah" className={ICON_ONLY_ON_PHONE}>
                  <PencilIcon className="size-[18px]" />
                  <span className="max-sm:sr-only">Ubah</span>
                </Button>
                <Button
                  variant="danger"
                  onClick={() => (setRemoveError(""), setRemoving(f))}
                  aria-label={`Hapus pertanyaan ${f.question}`}
                  title="Hapus"
                  className={ICON_ONLY_ON_PHONE}
                >
                  <TrashIcon className="size-[18px]" />
                  <span className="max-sm:sr-only">Hapus</span>
                </Button>
              </div>
            </div>
          )}
        />
      )}

      <Dialog open={draft !== null} onClose={() => setDraft(null)} title={draft?.id ? "Ubah pertanyaan" : "Tambah pertanyaan"}>
        {draft && (
          <form onSubmit={save} className="flex flex-col gap-4" noValidate>
            <Field
              id="faq-question"
              label="Pertanyaan"
              required
              value={draft.question}
              error={fieldErrors.question}
              onChange={(e) => setDraft({ ...draft, question: e.target.value })}
            />
            <RichTextEditor id="faq-answer" label="Jawaban" value={draft.answer} error={fieldErrors.answer} onChange={(answer) => setDraft({ ...draft, answer })} />
            <Checkbox
              id="faq-active"
              label="Tampilkan di situs"
              hint="Pertanyaan tersembunyi tetap tersimpan tapi tidak muncul di halaman FAQ."
              checked={draft.isActive}
              onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
            />
            {formError && <Alert>{formError}</Alert>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Batal
              </Button>
              <Button type="submit" loading={saving}>
                {draft.id ? "Simpan perubahan" : "Tambah pertanyaan"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog open={removing !== null} onClose={() => setRemoving(null)} title="Hapus pertanyaan">
        {removing && (
          <div className="flex flex-col gap-4">
            <p className="text-text">
              Hapus pertanyaan <strong>{removing.question}</strong>? Tindakan ini tidak bisa dibatalkan.
            </p>
            {removeError && <Alert>{removeError}</Alert>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setRemoving(null)}>
                Batal
              </Button>
              <Button variant="danger" loading={saving} onClick={confirmRemove}>
                Hapus pertanyaan
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
