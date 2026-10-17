"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminEvent } from "@/lib/catalog/event-service";
import type { AdminTicketCategory } from "@/lib/catalog/ticket-category-service";
import type { AdminVoucher } from "@/lib/catalog/voucher-service";
import { requestJson } from "@/lib/client-fetch";
import { formatRupiah, TIMEZONES, toIsoFromLocal, toLocalInput } from "@/lib/format";
import type { Timezone } from "@/lib/validation/catalog";

type Draft = {
  mode: "single" | "bulk";
  id?: number;
  code: string;
  prefix: string;
  count: string;
  length: string;
  type: "percent" | "fixed";
  value: string;
  maxDiscount: string;
  minQty: string;
  minSubtotal: string;
  ticketCategoryIds: number[];
  validFromLocal: string;
  validToLocal: string;
  maxUses: string;
  active: boolean;
};

const EMPTY: Omit<Draft, "mode"> = {
  code: "",
  prefix: "",
  count: "50",
  length: "8",
  type: "percent",
  value: "",
  maxDiscount: "",
  minQty: "0",
  minSubtotal: "0",
  ticketCategoryIds: [],
  validFromLocal: "",
  validToLocal: "",
  maxUses: "",
  active: true,
};

function discountLabel(v: AdminVoucher): string {
  if (v.type === "fixed") return `Potongan ${formatRupiah(v.value)}`;
  return `${v.value}%${v.maxDiscount ? `, maks ${formatRupiah(v.maxDiscount)}` : ""}`;
}

function status(v: AdminVoucher): { label: string; tone: "success" | "muted" | "warning" } {
  const now = Date.now();
  if (!v.active) return { label: "Nonaktif", tone: "muted" };
  if (v.validTo && new Date(v.validTo).getTime() < now) return { label: "Berakhir", tone: "muted" };
  if (v.validFrom && new Date(v.validFrom).getTime() > now) return { label: "Belum mulai", tone: "warning" };
  if (v.maxUses !== null && v.used + v.held >= v.maxUses) return { label: "Kuota habis", tone: "warning" };
  return { label: "Aktif", tone: "success" };
}

function downloadCodes(codes: string[], name: string) {
  const blob = new Blob([`﻿Kode\r\n${codes.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function VoucherManager() {
  const { id } = useParams<{ id: string }>();
  const eventId = Number(id);
  const base = `/api/admin/events/${eventId}/vouchers`;
  const [timezone, setTimezone] = useState<Timezone>("Asia/Jakarta");
  const [slug, setSlug] = useState("");
  const [categories, setCategories] = useState<AdminTicketCategory[]>([]);
  const [vouchers, setVouchers] = useState<AdminVoucher[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [generated, setGenerated] = useState<string[] | null>(null);
  const [removing, setRemoving] = useState<AdminVoucher | null>(null);
  const [removeError, setRemoveError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      requestJson<{ event: AdminEvent }>(`/api/admin/events/${eventId}`),
      requestJson<{ categories: AdminTicketCategory[] }>(`/api/admin/events/${eventId}/ticket-categories`),
      requestJson<{ vouchers: AdminVoucher[] }>(`/api/admin/events/${eventId}/vouchers`),
    ]).then(([ev, cats, list]) => {
      if (!active) return;
      const failed = [ev, cats, list].find((r) => !r.ok);
      if (failed && !failed.ok) return setLoadError(failed.error);
      if (ev.ok) {
        setTimezone(ev.data.event.timezone as Timezone);
        setSlug(ev.data.event.slug);
      }
      if (cats.ok) setCategories(cats.data.categories);
      if (list.ok) setVouchers(list.data.vouchers);
    });
    return () => {
      active = false;
    };
  }, [eventId]);

  async function reload() {
    const res = await requestJson<{ vouchers: AdminVoucher[] }>(base);
    if (res.ok) setVouchers(res.data.vouchers);
    else setLoadError(res.error);
  }

  function open(mode: Draft["mode"], v?: AdminVoucher) {
    setErrors({});
    setFormError("");
    setDraft(
      v
        ? {
            ...EMPTY,
            mode,
            id: v.id,
            code: v.code,
            type: v.type,
            value: String(v.value),
            maxDiscount: v.maxDiscount ? String(v.maxDiscount) : "",
            minQty: String(v.minQty),
            minSubtotal: String(v.minSubtotal),
            ticketCategoryIds: v.ticketCategoryIds,
            validFromLocal: v.validFrom ? toLocalInput(v.validFrom, timezone) : "",
            validToLocal: v.validTo ? toLocalInput(v.validTo, timezone) : "",
            maxUses: v.maxUses ? String(v.maxUses) : "",
            active: v.active,
          }
        : { ...EMPTY, mode },
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setErrors({});
    setFormError("");
    const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
    const orNull = (v: string) => (v.trim() === "" ? null : Number(v));
    const common = {
      type: draft.type,
      value: num(draft.value),
      maxDiscount: draft.type === "percent" ? orNull(draft.maxDiscount) : null,
      minQty: num(draft.minQty) ?? 0,
      minSubtotal: num(draft.minSubtotal) ?? 0,
      ticketCategoryIds: draft.ticketCategoryIds,
      validFrom: draft.validFromLocal ? toIsoFromLocal(draft.validFromLocal, timezone) : null,
      validTo: draft.validToLocal ? toIsoFromLocal(draft.validToLocal, timezone) : null,
      maxUses: orNull(draft.maxUses),
      active: draft.active,
    };
    if (draft.mode === "bulk") {
      const res = await requestJson<{ codes: string[] }>(`${base}/generate`, {
        body: { ...common, prefix: draft.prefix, count: num(draft.count), length: num(draft.length) },
      });
      setSaving(false);
      if (!res.ok) {
        setErrors(res.fields ?? {});
        return setFormError(res.error);
      }
      setDraft(null);
      setGenerated(res.data.codes);
      setNotice(`${res.data.codes.length} kode promo dibuat.`);
      return reload();
    }
    const body = { ...common, code: draft.code };
    const res = draft.id ? await requestJson(`${base}/${draft.id}`, { method: "PATCH", body }) : await requestJson(base, { body });
    setSaving(false);
    if (!res.ok) {
      setErrors(res.fields ?? {});
      return setFormError(res.error);
    }
    setNotice(draft.id ? `Voucher ${draft.code} disimpan.` : `Voucher ${draft.code} ditambahkan.`);
    setDraft(null);
    await reload();
  }

  async function remove(deactivate: boolean) {
    if (!removing) return;
    setSaving(true);
    setRemoveError("");
    const res = deactivate
      ? await requestJson(`${base}/${removing.id}`, {
          method: "PATCH",
          body: {
            code: removing.code,
            type: removing.type,
            value: removing.value,
            maxDiscount: removing.maxDiscount,
            minQty: removing.minQty,
            minSubtotal: removing.minSubtotal,
            ticketCategoryIds: removing.ticketCategoryIds,
            validFrom: removing.validFrom,
            validTo: removing.validTo,
            maxUses: removing.maxUses,
            active: false,
          },
        })
      : await requestJson(`${base}/${removing.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) return setRemoveError(res.error);
    setNotice(deactivate ? `Voucher ${removing.code} dinonaktifkan.` : `Voucher ${removing.code} dihapus.`);
    setRemoving(null);
    await reload();
  }

  const tz = TIMEZONES[timezone].label;
  const fmt = (d: Date | string) =>
    new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(d));
  const needle = q.trim().toLowerCase();
  const shown = vouchers?.filter((v) => !needle || v.code.toLowerCase().includes(needle)) ?? null;
  const used = vouchers?.reduce((s, v) => s + v.paidOrders, 0) ?? 0;
  const given = vouchers?.reduce((s, v) => s + v.discountTotal, 0) ?? 0;

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted">
          Diskon memotong harga tiket, bukan biaya layanan. Satu pesanan memakai satu kode. Waktu dalam {tz}.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => open("bulk")} disabled={!vouchers}>
            Buat massal
          </Button>
          <Button onClick={() => open("single")} disabled={!vouchers}>
            Tambah voucher
          </Button>
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {loadError && <Alert>{loadError}</Alert>}

      {!vouchers && !loadError && (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Memuat voucher">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      )}

      {vouchers && vouchers.length > 0 && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-full sm:w-72">
            <Field id="voucher-q" label="Cari kode" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <p className="text-sm text-muted">
            {vouchers.length} voucher · dipakai di <span className="font-semibold text-text">{used} pesanan lunas</span> · total diskon{" "}
            <span className="font-semibold text-text">{formatRupiah(given)}</span>
          </p>
        </div>
      )}

      {vouchers?.length === 0 && (
        <p className="rounded-lg border border-dashed border-border-strong p-6 text-center text-muted">
          Belum ada voucher untuk event ini.
        </p>
      )}

      {shown && shown.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {shown.map((v) => {
            const s = status(v);
            return (
              <li key={v.id} className="flex flex-wrap items-start gap-3 px-3 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-all font-mono font-semibold text-text">{v.code}</span>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </div>
                  <p className="text-sm text-text">{discountLabel(v)}</p>
                  <p className="text-sm text-muted">
                    Terpakai {v.used}
                    {v.held > 0 && ` (+${v.held} menunggu bayar)`} dari {v.maxUses ?? "tanpa batas"} · {v.paidOrders} pesanan lunas, diskon{" "}
                    {formatRupiah(v.discountTotal)}
                    {(v.validFrom || v.validTo) && ` · ${v.validFrom ? fmt(v.validFrom) : "sekarang"} s.d. ${v.validTo ? fmt(v.validTo) : "selesai"}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => open("single", v)} aria-label={`Ubah ${v.code}`}>
                    Ubah
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => (setRemoveError(""), setRemoving(v))} aria-label={`Hapus ${v.code}`}>
                    Hapus
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {shown?.length === 0 && vouchers && vouchers.length > 0 && <p className="text-sm text-muted">Tidak ada kode yang cocok.</p>}

      <Dialog
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.mode === "bulk" ? "Buat voucher massal" : draft?.id ? "Ubah voucher" : "Tambah voucher"}
      >
        {draft && (
          <form onSubmit={save} noValidate className="flex flex-col gap-4">
            {draft.mode === "single" ? (
              <Field id="v-code" label="Kode" hint="Huruf besar dan kecil dianggap sama saat dipakai." value={draft.code} error={errors.code} autoCapitalize="characters" onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="v-prefix" label="Awalan (opsional)" hint="Contoh: JAZZ" value={draft.prefix} error={errors.prefix} autoCapitalize="characters" onChange={(e) => setDraft({ ...draft, prefix: e.target.value })} />
                <Field id="v-count" label="Jumlah kode" type="number" inputMode="numeric" min={1} max={500} value={draft.count} error={errors.count} onChange={(e) => setDraft({ ...draft, count: e.target.value })} />
                <Field id="v-length" label="Panjang acak" type="number" inputMode="numeric" min={6} max={12} value={draft.length} error={errors.length} onChange={(e) => setDraft({ ...draft, length: e.target.value })} />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                id="v-type"
                label="Jenis diskon"
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as Draft["type"] })}
                options={[
                  { value: "percent", label: "Persen" },
                  { value: "fixed", label: "Potongan rupiah" },
                ]}
              />
              <Field id="v-value" label={draft.type === "percent" ? "Persen (1–100)" : "Potongan (Rp)"} type="number" inputMode="numeric" min={1} value={draft.value} error={errors.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
            </div>
            {draft.type === "percent" && (
              <Field id="v-max-discount" label="Maksimal diskon (Rp, opsional)" type="number" inputMode="numeric" min={1} value={draft.maxDiscount} error={errors.maxDiscount} onChange={(e) => setDraft({ ...draft, maxDiscount: e.target.value })} />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="v-min-qty" label="Minimal jumlah tiket" type="number" inputMode="numeric" min={0} value={draft.minQty} error={errors.minQty} onChange={(e) => setDraft({ ...draft, minQty: e.target.value })} />
              <Field id="v-min-subtotal" label="Minimal subtotal (Rp)" type="number" inputMode="numeric" min={0} value={draft.minSubtotal} error={errors.minSubtotal} onChange={(e) => setDraft({ ...draft, minSubtotal: e.target.value })} />
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-text">Berlaku untuk kategori tiket</legend>
              <p className="text-sm text-muted">Kosongkan untuk semua kategori. Syarat minimal dihitung dari kategori yang dipilih saja.</p>
              {categories.map((c) => (
                <Checkbox
                  key={c.id}
                  id={`v-cat-${c.id}`}
                  label={c.name}
                  checked={draft.ticketCategoryIds.includes(c.id)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      ticketCategoryIds: e.target.checked ? [...draft.ticketCategoryIds, c.id] : draft.ticketCategoryIds.filter((x) => x !== c.id),
                    })
                  }
                />
              ))}
              {errors.ticketCategoryIds && <p className="text-sm text-danger">{errors.ticketCategoryIds}</p>}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="v-from" label={`Berlaku mulai (${tz}, opsional)`} type="datetime-local" value={draft.validFromLocal} error={errors.validFrom} onChange={(e) => setDraft({ ...draft, validFromLocal: e.target.value })} />
              <Field id="v-to" label={`Berlaku sampai (${tz}, opsional)`} type="datetime-local" value={draft.validToLocal} error={errors.validTo} onChange={(e) => setDraft({ ...draft, validToLocal: e.target.value })} />
            </div>
            <Field id="v-max-uses" label={draft.mode === "bulk" ? "Kuota per kode (opsional)" : "Kuota pemakaian (opsional)"} hint="Kosongkan untuk tanpa batas." type="number" inputMode="numeric" min={1} value={draft.maxUses} error={errors.maxUses} onChange={(e) => setDraft({ ...draft, maxUses: e.target.value })} />
            <Checkbox id="v-active" label="Aktif" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            {formError && <Alert>{formError}</Alert>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Batal
              </Button>
              <Button type="submit" loading={saving}>
                {draft.mode === "bulk" ? "Buat kode" : draft.id ? "Simpan perubahan" : "Tambah voucher"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog open={generated !== null} onClose={() => setGenerated(null)} title="Kode promo dibuat">
        {generated && (
          <div className="flex flex-col gap-4">
            <p className="text-text">{generated.length} kode siap dibagikan.</p>
            <ul className="grid max-h-60 grid-cols-2 gap-1 overflow-y-auto rounded-md bg-surface-muted p-3 font-mono text-sm text-text sm:grid-cols-3">
              {generated.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setGenerated(null)}>
                Tutup
              </Button>
              <Button onClick={() => downloadCodes(generated, `voucher-${slug || eventId}.csv`)}>Unduh daftar kode (CSV)</Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={removing !== null} onClose={() => setRemoving(null)} title="Hapus voucher">
        {removing && (
          <div className="flex flex-col gap-4">
            <p className="text-text">
              Hapus <strong className="font-mono">{removing.code}</strong>? Voucher yang sudah dipakai di pesanan tidak bisa dihapus, hanya dinonaktifkan.
            </p>
            {removeError && <Alert>{removeError}</Alert>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setRemoving(null)}>
                Batal
              </Button>
              {removeError && removing.active && (
                <Button variant="secondary" loading={saving} onClick={() => remove(true)}>
                  Nonaktifkan
                </Button>
              )}
              <Button variant="danger" loading={saving} onClick={() => remove(false)}>
                Hapus voucher
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
