"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { PencilIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { RichTextEditor } from "@/components/rich-text-editor";
import { SortableList } from "@/components/sortable-list";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, ICON_ONLY_ON_PHONE } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminEvent } from "@/lib/catalog/event-service";
import type { AdminTicketCategory } from "@/lib/catalog/ticket-category-service";
import { requestJson } from "@/lib/client-fetch";
import { formatRupiah, TIMEZONES, toIsoFromLocal, toLocalInput } from "@/lib/format";
import type { Timezone } from "@/lib/validation/catalog";

type Draft = {
  id?: number;
  name: string;
  description: string;
  price: string;
  capacity: string;
  saleStartsLocal: string;
  saleEndsLocal: string;
  maxPerOrder: string;
  admitsPerUnit: string;
  hasMerchandise: boolean;
  status: string;
  everReserved: boolean;
};

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draf", tone: "muted" },
  active: { label: "Aktif", tone: "success" },
  hidden: { label: "Tersembunyi", tone: "muted" },
};

function QuotaBar({ c }: { c: AdminTicketCategory }) {
  const pct = (n: number) => (c.capacity > 0 ? (n / c.capacity) * 100 : 0);
  return (
    <div className="flex flex-col gap-1">
      <div aria-hidden className="flex h-2 overflow-hidden rounded-full bg-surface-muted">
        <span className="bg-accent" style={{ width: `${pct(c.sold)}%` }} />
        <span className="bg-warning" style={{ width: `${pct(c.held)}%` }} />
      </div>
      <p className="text-xs text-muted">
        <span className="font-semibold text-accent-text">{c.sold} terjual</span> · {c.held} sedang dipesan · {c.available} tersedia dari{" "}
        {c.capacity}
      </p>
    </div>
  );
}

export function TicketCategoryManager() {
  const { id } = useParams<{ id: string }>();
  const eventId = Number(id);
  const [timezone, setTimezone] = useState<Timezone>("Asia/Jakarta");
  const [categories, setCategories] = useState<AdminTicketCategory[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<AdminTicketCategory | null>(null);
  const [removeError, setRemoveError] = useState("");
  const base = `/api/admin/events/${eventId}/ticket-categories`;

  useEffect(() => {
    let active = true;
    Promise.all([
      requestJson<{ event: AdminEvent }>(`/api/admin/events/${eventId}`),
      requestJson<{ categories: AdminTicketCategory[] }>(`/api/admin/events/${eventId}/ticket-categories`),
    ]).then(([ev, cats]) => {
      if (!active) return;
      if (!ev.ok) return setLoadError(ev.error);
      if (!cats.ok) return setLoadError(cats.error);
      setTimezone(ev.data.event.timezone as Timezone);
      setCategories(cats.data.categories);
    });
    return () => {
      active = false;
    };
  }, [eventId]);

  async function reload() {
    const res = await requestJson<{ categories: AdminTicketCategory[] }>(base);
    if (res.ok) setCategories(res.data.categories);
    else setLoadError(res.error);
  }

  function open(c?: AdminTicketCategory) {
    setErrors({});
    setFormError("");
    const now = new Date();
    setDraft(
      c
        ? {
            id: c.id,
            name: c.name,
            description: c.description,
            price: String(c.price),
            capacity: String(c.capacity),
            saleStartsLocal: toLocalInput(c.saleStartsAt, timezone),
            saleEndsLocal: toLocalInput(c.saleEndsAt, timezone),
            maxPerOrder: String(c.maxPerOrder),
            admitsPerUnit: String(c.admitsPerUnit),
            hasMerchandise: c.hasMerchandise,
            status: c.status,
            everReserved: c.everReserved,
          }
        : {
            name: "",
            description: "",
            price: "",
            capacity: "",
            saleStartsLocal: toLocalInput(now, timezone),
            saleEndsLocal: "",
            maxPerOrder: "5",
            admitsPerUnit: "1",
            hasMerchandise: false,
            status: "active",
            everReserved: false,
          },
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setErrors({});
    setFormError("");
    const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
    const body = {
      name: draft.name,
      description: draft.description,
      price: num(draft.price),
      capacity: num(draft.capacity),
      saleStartsAt: draft.saleStartsLocal ? toIsoFromLocal(draft.saleStartsLocal, timezone) : "",
      saleEndsAt: draft.saleEndsLocal ? toIsoFromLocal(draft.saleEndsLocal, timezone) : "",
      maxPerOrder: num(draft.maxPerOrder),
      admitsPerUnit: num(draft.admitsPerUnit),
      hasMerchandise: draft.hasMerchandise,
      status: draft.status,
    };
    const res = draft.id
      ? await requestJson(`${base}/${draft.id}`, { method: "PATCH", body })
      : await requestJson(base, { body });
    setSaving(false);
    if (!res.ok) {
      setErrors(res.fields ?? {});
      return setFormError(res.error);
    }
    setNotice(draft.id ? `Kategori tiket "${draft.name}" disimpan.` : `Kategori tiket "${draft.name}" ditambahkan.`);
    setDraft(null);
    await reload();
  }

  async function reorder(ids: number[]) {
    if (!categories) return;
    const previous = categories;
    setCategories(ids.map((x) => previous.find((c) => c.id === x)!));
    const res = await requestJson(`${base}/reorder`, { method: "PUT", body: { ids } });
    if (!res.ok) {
      setCategories(previous);
      setLoadError(res.error);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setSaving(true);
    setRemoveError("");
    const res = await requestJson(`${base}/${removing.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) return setRemoveError(res.error);
    setNotice(`Kategori tiket "${removing.name}" dihapus.`);
    setRemoving(null);
    await reload();
  }

  const tz = TIMEZONES[timezone].label;
  const fmt = (d: Date | string) =>
    new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(d));

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted">
          Urutan di sini sama dengan urutan kartu tiket di halaman pemesanan. Waktu dalam {tz}.
        </p>
        <Button onClick={() => open()} disabled={!categories} aria-label="Tambah kategori tiket" title="Tambah kategori tiket" className={ICON_ONLY_ON_PHONE}>
          <PlusIcon className="size-5" />
          <span className="max-sm:sr-only">Tambah kategori tiket</span>
        </Button>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {loadError && <Alert>{loadError}</Alert>}

      {!categories && !loadError && (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Memuat kategori tiket">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}

      {categories?.length === 0 && (
        <p className="rounded-lg border border-dashed border-border-strong p-6 text-center text-muted">
          Belum ada kategori tiket. Tambahkan minimal satu agar event bisa dipesan.
        </p>
      )}

      {categories && categories.length > 0 && (
        <SortableList
          items={categories}
          getId={(c) => c.id}
          onReorder={reorder}
          className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
          renderItem={(c, handle) => (
            <div className="flex items-start gap-2 px-2 py-3 sm:px-3">
              {handle}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-text">{c.name}</span>
                  <Badge tone={STATUS[c.status]?.tone}>{STATUS[c.status]?.label ?? c.status}</Badge>
                  {c.admitsPerUnit > 1 && <Badge tone="accent">Bundle (isi {c.admitsPerUnit})</Badge>}
                  {c.hasMerchandise && <Badge tone="accent">+ Merchandise</Badge>}
                </div>
                <p className="text-sm text-muted">
                  <span className="font-semibold text-text">{formatRupiah(c.price)}</span> · maks {c.maxPerOrder} per transaksi ·
                  dijual {fmt(c.saleStartsAt)} s.d. {fmt(c.saleEndsAt)} {tz}
                </p>
                <QuotaBar c={c} />
              </div>
              <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:gap-2">
                <Button variant="secondary" onClick={() => open(c)} aria-label={`Ubah ${c.name}`} title="Ubah" className={ICON_ONLY_ON_PHONE}>
                  <PencilIcon className="size-[18px]" />
                  <span className="max-sm:sr-only">Ubah</span>
                </Button>
                <Button variant="danger" onClick={() => (setRemoveError(""), setRemoving(c))} aria-label={`Hapus ${c.name}`} title="Hapus" className={ICON_ONLY_ON_PHONE}>
                  <TrashIcon className="size-[18px]" />
                  <span className="max-sm:sr-only">Hapus</span>
                </Button>
              </div>
            </div>
          )}
        />
      )}

      <Dialog open={draft !== null} onClose={() => setDraft(null)} title={draft?.id ? "Ubah kategori tiket" : "Tambah kategori tiket"}>
        {draft && (
          <form onSubmit={save} noValidate className="flex flex-col gap-4">
            <Field id="tc-name" label="Nama" hint="Contoh: Presale VIP, BATCH 2 - Mahasiswa, Bundling Couple." value={draft.name} error={errors.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="tc-price" label="Harga (Rp)" type="number" inputMode="numeric" min={1000} step={1000} value={draft.price} error={errors.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
              <Field id="tc-capacity" label="Kuota" hint="Dalam unit yang dijual." type="number" inputMode="numeric" min={0} value={draft.capacity} error={errors.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="tc-start" label={`Mulai dijual (${tz})`} type="datetime-local" value={draft.saleStartsLocal} error={errors.saleStartsAt} onChange={(e) => setDraft({ ...draft, saleStartsLocal: e.target.value })} />
              <Field id="tc-end" label={`Selesai dijual (${tz})`} type="datetime-local" value={draft.saleEndsLocal} error={errors.saleEndsAt} onChange={(e) => setDraft({ ...draft, saleEndsLocal: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="tc-max" label="Maks. per transaksi" type="number" inputMode="numeric" min={1} max={50} value={draft.maxPerOrder} error={errors.maxPerOrder} onChange={(e) => setDraft({ ...draft, maxPerOrder: e.target.value })} />
              <Field id="tc-admits" label="Orang per tiket" hint={draft.everReserved ? "Dikunci karena kategori ini sudah pernah dipesan." : "Isi 2 untuk Bundle Couple: 1 tiket = 2 QR."} disabled={draft.everReserved} type="number" inputMode="numeric" min={1} max={20} value={draft.admitsPerUnit} error={errors.admitsPerUnit} onChange={(e) => setDraft({ ...draft, admitsPerUnit: e.target.value })} />
            </div>
            <Select
              id="tc-status"
              label="Status"
              hint="Hanya kategori aktif yang bisa dipesan. Tersembunyi tidak tampil di situs."
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              options={[
                { value: "active", label: "Aktif" },
                { value: "draft", label: "Draf" },
                { value: "hidden", label: "Tersembunyi" },
              ]}
            />
            <Checkbox id="tc-merch" label="Termasuk merchandise" hint="Menampilkan badge + Merchandise. Ukuran baju dsb. diminta lewat Form Pemesan." checked={draft.hasMerchandise} onChange={(e) => setDraft({ ...draft, hasMerchandise: e.target.checked })} />
            <RichTextEditor id="tc-description" label="Deskripsi (opsional)" value={draft.description} error={errors.description} onChange={(v) => setDraft({ ...draft, description: v })} />
            {formError && <Alert>{formError}</Alert>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Batal
              </Button>
              <Button type="submit" loading={saving}>
                {draft.id ? "Simpan perubahan" : "Tambah kategori tiket"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog open={removing !== null} onClose={() => setRemoving(null)} title="Hapus kategori tiket">
        {removing && (
          <div className="flex flex-col gap-4">
            <p className="text-text">
              Hapus <strong>{removing.name}</strong>? Kategori yang pernah dipesan tidak bisa dihapus, hanya disembunyikan.
            </p>
            {removeError && <Alert>{removeError}</Alert>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setRemoving(null)}>
                Batal
              </Button>
              <Button variant="danger" loading={saving} onClick={confirmRemove}>
                Hapus kategori tiket
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
