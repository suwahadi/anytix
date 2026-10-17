"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { ImageUpload } from "@/components/image-upload";
import { SortableList } from "@/components/sortable-list";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import type { EventCategory } from "@/lib/catalog/event-category-service";
import { requestJson } from "@/lib/client-fetch";
import { mediaUrl } from "@/lib/media";

type Draft = { id?: number; name: string; slug: string; icon: string | null; isActive: boolean };
type FieldErrors = Record<string, string>;

const EMPTY: Draft = { name: "", slug: "", icon: null, isActive: true };
const fetchCategories = () => requestJson<{ categories: EventCategory[] }>("/api/admin/event-categories");

export function CategoryManager() {
  const [categories, setCategories] = useState<EventCategory[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<EventCategory | null>(null);
  const [removeError, setRemoveError] = useState("");

  useEffect(() => {
    let active = true;
    fetchCategories().then((res) => {
      if (!active) return;
      if (res.ok) setCategories(res.data.categories);
      else setLoadError(res.error);
    });
    return () => {
      active = false;
    };
  }, []);

  async function reload() {
    setLoadError("");
    const res = await fetchCategories();
    if (res.ok) setCategories(res.data.categories);
    else setLoadError(res.error);
  }

  function openDraft(category?: EventCategory) {
    setFieldErrors({});
    setFormError("");
    setDraft(
      category
        ? { id: category.id, name: category.name, slug: category.slug, icon: category.icon, isActive: category.isActive }
        : EMPTY,
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setFieldErrors({});
    setFormError("");
    const body = { name: draft.name, slug: draft.slug, icon: draft.icon, isActive: draft.isActive };
    const res = draft.id
      ? await requestJson(`/api/admin/event-categories/${draft.id}`, { method: "PATCH", body })
      : await requestJson("/api/admin/event-categories", { body });
    setSaving(false);
    if (!res.ok) {
      setFieldErrors(res.fields ?? {});
      return setFormError(res.error);
    }
    setNotice(draft.id ? `Kategori "${draft.name}" disimpan.` : `Kategori "${draft.name}" ditambahkan.`);
    setDraft(null);
    await reload();
  }

  async function reorder(ids: number[]) {
    if (!categories) return;
    const previous = categories;
    setCategories(ids.map((id) => previous.find((c) => c.id === id)!));
    const res = await requestJson("/api/admin/event-categories/reorder", { method: "PUT", body: { ids } });
    if (!res.ok) {
      setCategories(previous);
      setNotice("");
      setLoadError(res.error);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setSaving(true);
    setRemoveError("");
    const res = await requestJson(`/api/admin/event-categories/${removing.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) return setRemoveError(res.error);
    setNotice(`Kategori "${removing.name}" dihapus.`);
    setRemoving(null);
    await reload();
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted">
          Urutan di sini sama dengan urutan kategori di beranda. Geser lewat tombol titik-titik, atau fokuskan lalu tekan
          spasi dan panah.
        </p>
        <Button onClick={() => openDraft()}>Tambah kategori</Button>
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

      {!categories && !loadError && (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Memuat kategori">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      )}

      {categories?.length === 0 && (
        <p className="rounded-lg border border-dashed border-border-strong p-6 text-center text-muted">
          Belum ada kategori. Tambahkan minimal satu sebelum membuat event.
        </p>
      )}

      {categories && categories.length > 0 && (
        <SortableList
          items={categories}
          getId={(c) => c.id}
          onReorder={reorder}
          className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
          renderItem={(c, handle) => (
            <div className="flex items-center gap-3 px-2 py-2 sm:px-3">
              {handle}
              {c.icon ? (
                <Image
                  src={mediaUrl(c.icon, "thumb")}
                  alt=""
                  width={40}
                  height={40}
                  unoptimized
                  className="hidden size-10 shrink-0 rounded-md bg-surface-muted object-cover sm:block"
                />
              ) : (
                <span
                  aria-hidden
                  className="hidden size-10 shrink-0 items-center justify-center rounded-md bg-surface-muted text-sm font-bold text-muted sm:flex"
                >
                  {c.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-text">
                  <span className="break-words">{c.name}</span>
                  {!c.isActive && <Badge>Tersembunyi</Badge>}
                </p>
                <p className="truncate text-sm text-muted">
                  /{c.slug} · {c.eventCount} event
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" onClick={() => openDraft(c)} aria-label={`Ubah kategori ${c.name}`}>
                  Ubah
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => (setRemoveError(""), setRemoving(c))}
                  aria-label={`Hapus kategori ${c.name}`}
                >
                  Hapus
                </Button>
              </div>
            </div>
          )}
        />
      )}

      <Dialog open={draft !== null} onClose={() => setDraft(null)} title={draft?.id ? "Ubah kategori" : "Tambah kategori"}>
        {draft && (
          <form id="category-form" onSubmit={save} className="flex flex-col gap-4" noValidate>
            <Field
              id="category-name"
              label="Nama"
              required
              value={draft.name}
              error={fieldErrors.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Field
              id="category-slug"
              label="Slug"
              hint="Dipakai di alamat /events?category=…. Kosongkan untuk dibuat otomatis dari nama."
              value={draft.slug}
              error={fieldErrors.slug}
              onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
            />
            <ImageUpload
              kind="icon"
              label="Ikon"
              hint="Opsional. Gambar persegi, minimal 160 × 160 px."
              value={draft.icon}
              onChange={(icon) => setDraft({ ...draft, icon })}
            />
            <Checkbox
              id="category-active"
              label="Tampilkan di situs"
              hint="Kategori tersembunyi tidak muncul di beranda dan filter, tapi event di dalamnya tetap bisa dibuka."
              checked={draft.isActive}
              onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
            />
            {formError && <Alert>{formError}</Alert>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Batal
              </Button>
              <Button type="submit" loading={saving}>
                {draft.id ? "Simpan perubahan" : "Tambah kategori"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog open={removing !== null} onClose={() => setRemoving(null)} title="Hapus kategori">
        {removing && (
          <div className="flex flex-col gap-4">
            <p className="text-text">
              Hapus kategori <strong>{removing.name}</strong>? Tindakan ini tidak bisa dibatalkan.
            </p>
            {removeError && <Alert>{removeError}</Alert>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setRemoving(null)}>
                Batal
              </Button>
              <Button variant="danger" loading={saving} onClick={confirmRemove}>
                Hapus kategori
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
