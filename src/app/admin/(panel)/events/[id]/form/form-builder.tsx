"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { DynamicFormFields, type AnswerValues } from "@/components/dynamic-form-fields";
import { SortableList } from "@/components/sortable-list";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminFormField } from "@/lib/catalog/form-field-service";
import { requestJson } from "@/lib/client-fetch";
import {
  buildAnswersSchema,
  FIELD_TYPE_LABELS,
  FIELD_TYPES,
  IDENTITY_TYPES,
  OPTION_TYPES,
  type FieldType,
} from "@/lib/form-schema";

type Option = { label: string; value: string };
type Draft = {
  id?: number;
  answered: boolean;
  type: FieldType;
  label: string;
  key: string;
  helpText: string;
  placeholder: string;
  required: boolean;
  isActive: boolean;
  options: Option[];
  v: Record<string, string>;
  identityTypes: string[];
};

const NUMERIC_KEYS = ["minLength", "maxLength", "min", "max", "minAge", "minSelected", "maxSelected"];

function toDraft(f?: AdminFormField): Draft {
  if (!f) {
    return {
      answered: false,
      type: "short_text",
      label: "",
      key: "",
      helpText: "",
      placeholder: "",
      required: false,
      isActive: true,
      options: [],
      v: {},
      identityTypes: IDENTITY_TYPES.map((t) => t.value),
    };
  }
  const { identityTypes, ...rest } = f.validation ?? {};
  return {
    id: f.id,
    answered: f.answerCount > 0,
    type: f.type,
    label: f.label,
    key: f.key,
    helpText: f.helpText ?? "",
    placeholder: f.placeholder ?? "",
    required: f.required,
    isActive: f.isActive,
    options: f.options,
    v: Object.fromEntries(Object.entries(rest).map(([k, val]) => [k, String(val)])),
    identityTypes: identityTypes ?? IDENTITY_TYPES.map((t) => t.value),
  };
}

function toBody(d: Draft) {
  const validation: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(d.v)) {
    if (val.trim() === "") continue;
    validation[k] = NUMERIC_KEYS.includes(k) ? Number(val) : val;
  }
  if (d.type === "identity") validation.identityTypes = d.identityTypes;
  return {
    type: d.type,
    label: d.label,
    key: d.key,
    helpText: d.helpText,
    placeholder: d.placeholder,
    required: d.required,
    isActive: d.isActive,
    options: OPTION_TYPES.includes(d.type) ? d.options : [],
    validation,
  };
}

export function FormBuilder() {
  const { id } = useParams<{ id: string }>();
  const base = `/api/admin/events/${id}/form-fields`;
  const [fields, setFields] = useState<AdminFormField[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<AdminFormField | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [preview, setPreview] = useState<AnswerValues>({});
  const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({});
  const [previewResult, setPreviewResult] = useState("");

  useEffect(() => {
    let active = true;
    requestJson<{ fields: AdminFormField[] }>(`/api/admin/events/${id}/form-fields`).then((res) => {
      if (!active) return;
      if (res.ok) setFields(res.data.fields);
      else setLoadError(res.error);
    });
    return () => {
      active = false;
    };
  }, [id]);

  async function reload() {
    const res = await requestJson<{ fields: AdminFormField[] }>(base);
    if (res.ok) setFields(res.data.fields);
    else setLoadError(res.error);
  }

  function open(f?: AdminFormField) {
    setErrors({});
    setFormError("");
    setDraft(toDraft(f));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setErrors({});
    setFormError("");
    const body = toBody(draft);
    const res = draft.id
      ? await requestJson(`${base}/${draft.id}`, { method: "PATCH", body })
      : await requestJson(base, { body });
    setSaving(false);
    if (!res.ok) {
      setErrors(res.fields ?? {});
      return setFormError(res.error);
    }
    setNotice(`Field "${draft.label}" disimpan.`);
    setDraft(null);
    await reload();
  }

  async function reorder(ids: number[]) {
    if (!fields) return;
    const previous = fields;
    setFields(ids.map((x) => previous.find((f) => f.id === x)!));
    const res = await requestJson(`${base}/reorder`, { method: "PUT", body: { ids } });
    if (!res.ok) {
      setFields(previous);
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
    setNotice(`Field "${removing.label}" dihapus.`);
    setRemoving(null);
    await reload();
  }

  function testPreview() {
    if (!fields) return;
    const result = buildAnswersSchema(fields).safeParse(preview);
    if (result.success) {
      setPreviewErrors({});
      return setPreviewResult("Semua isian valid.");
    }
    const errs: Record<string, string> = {};
    for (const issue of result.error.issues) errs[String(issue.path[0])] ??= issue.message;
    setPreviewErrors(errs);
    setPreviewResult("");
  }

  const setV = (key: string, value: string) => draft && setDraft({ ...draft, v: { ...draft.v, [key]: value } });
  const numberField = (key: string, label: string) =>
    draft && (
      <Field
        id={`ff-${key}`}
        label={label}
        type="number"
        inputMode="numeric"
        value={draft.v[key] ?? ""}
        error={errors[`validation.${key}`]}
        onChange={(e) => setV(key, e.target.value)}
      />
    );

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_minmax(0,24rem)]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-prose text-sm text-muted">
            Nama Lengkap, Email, dan No. WhatsApp selalu diminta. Field di sini menjadi tambahan dan diisi sekali per pesanan.
          </p>
          <Button onClick={() => open()} disabled={!fields}>
            Tambah field
          </Button>
        </div>

        {notice && <Alert tone="success">{notice}</Alert>}
        {loadError && <Alert>{loadError}</Alert>}
        {!fields && !loadError && <Skeleton className="h-32" />}
        {fields?.length === 0 && (
          <p className="rounded-lg border border-dashed border-border-strong p-6 text-center text-muted">
            Belum ada field tambahan. Event ini hanya meminta data pemesan standar.
          </p>
        )}
        {fields && fields.length > 0 && (
          <SortableList
            items={fields}
            getId={(f) => f.id}
            onReorder={reorder}
            className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
            renderItem={(f, handle) => (
              <div className="flex items-center gap-2 px-2 py-2 sm:px-3">
                {handle}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-text">
                    {f.label}
                    {f.required && <Badge tone="accent">Wajib</Badge>}
                    {!f.isActive && <Badge>Nonaktif</Badge>}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {FIELD_TYPE_LABELS[f.type]} · {f.key}
                    {f.answerCount > 0 && ` · ${f.answerCount} jawaban`}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => open(f)} aria-label={`Ubah ${f.label}`}>
                  Ubah
                </Button>
                <Button variant="ghost" size="sm" onClick={() => (setRemoveError(""), setRemoving(f))} aria-label={`Hapus ${f.label}`}>
                  Hapus
                </Button>
              </div>
            )}
          />
        )}
      </div>

      <aside aria-labelledby="preview-title" className="flex flex-col gap-4 self-start rounded-lg border border-border bg-surface p-4">
        <h2 id="preview-title" className="text-lg font-bold text-text">
          Pratinjau isian pemesan
        </h2>
        {fields && fields.filter((f) => f.isActive).length > 0 ? (
          <>
            <DynamicFormFields
              fields={fields}
              values={preview}
              errors={previewErrors}
              idPrefix="preview"
              onChange={(key, value) => setPreview({ ...preview, [key]: value })}
            />
            <Button variant="secondary" onClick={testPreview}>
              Uji isian
            </Button>
            {previewResult && <Alert tone="success">{previewResult}</Alert>}
          </>
        ) : (
          <p className="text-sm text-muted">Field aktif akan tampil di sini persis seperti yang dilihat pembeli.</p>
        )}
      </aside>

      <Dialog open={draft !== null} onClose={() => setDraft(null)} title={draft?.id ? "Ubah field" : "Tambah field"}>
        {draft && (
          <form onSubmit={save} noValidate className="flex flex-col gap-4">
            {draft.answered && <Alert tone="warning">Field ini sudah punya jawaban, jadi tipe dan key dikunci.</Alert>}
            <Select
              id="ff-type"
              label="Tipe"
              value={draft.type}
              disabled={draft.answered}
              error={errors.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as FieldType })}
              options={FIELD_TYPES.map((t) => ({ value: t, label: FIELD_TYPE_LABELS[t] }))}
            />
            <Field id="ff-label" label="Label" value={draft.label} error={errors.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            <Field
              id="ff-key"
              label="Key"
              hint="Nama teknis untuk ekspor data. Kosongkan untuk dibuat otomatis dari label."
              value={draft.key}
              disabled={draft.answered}
              error={errors.key}
              onChange={(e) => setDraft({ ...draft, key: e.target.value })}
            />
            <Field id="ff-help" label="Teks bantuan" value={draft.helpText} error={errors.helpText} onChange={(e) => setDraft({ ...draft, helpText: e.target.value })} />
            {draft.type !== "identity" && OPTION_TYPES.indexOf(draft.type) === -1 && (
              <Field id="ff-placeholder" label="Placeholder" value={draft.placeholder} error={errors.placeholder} onChange={(e) => setDraft({ ...draft, placeholder: e.target.value })} />
            )}

            {(draft.type === "short_text" || draft.type === "long_text") && (
              <div className="grid gap-4 sm:grid-cols-2">
                {draft.type === "short_text" && numberField("minLength", "Panjang minimal")}
                {numberField("maxLength", "Panjang maksimal")}
                {draft.type === "short_text" && (
                  <Field
                    id="ff-pattern"
                    label="Pola regex (opsional)"
                    hint="Contoh: ^[0-9]{5}$ untuk 5 digit."
                    value={draft.v.pattern ?? ""}
                    error={errors["validation.pattern"]}
                    onChange={(e) => setV("pattern", e.target.value)}
                  />
                )}
              </div>
            )}
            {draft.type === "number" && (
              <div className="grid gap-4 sm:grid-cols-2">
                {numberField("min", "Nilai minimal")}
                {numberField("max", "Nilai maksimal")}
              </div>
            )}
            {draft.type === "date" && (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="ff-minDate" label="Tanggal paling awal" type="date" value={draft.v.minDate ?? ""} onChange={(e) => setV("minDate", e.target.value)} />
                <Field id="ff-maxDate" label="Tanggal paling akhir" type="date" value={draft.v.maxDate ?? ""} onChange={(e) => setV("maxDate", e.target.value)} />
                {numberField("minAge", "Usia minimal (tahun)")}
              </div>
            )}
            {OPTION_TYPES.includes(draft.type) && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-text">Opsi</legend>
                {draft.options.map((o, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <Field
                      id={`ff-opt-label-${i}`}
                      label={`Label opsi ${i + 1}`}
                      value={o.label}
                      onChange={(e) => {
                        const options = [...draft.options];
                        const auto = !o.value || o.value === o.label;
                        options[i] = { label: e.target.value, value: auto ? e.target.value : o.value };
                        setDraft({ ...draft, options });
                      }}
                    />
                    <Field
                      id={`ff-opt-value-${i}`}
                      label="Nilai"
                      value={o.value}
                      onChange={(e) => {
                        const options = [...draft.options];
                        options[i] = { ...o, value: e.target.value };
                        setDraft({ ...draft, options });
                      }}
                    />
                    <Button variant="ghost" onClick={() => setDraft({ ...draft, options: draft.options.filter((_, j) => j !== i) })} aria-label={`Hapus opsi ${i + 1}`}>
                      Hapus
                    </Button>
                  </div>
                ))}
                {errors.options && <p className="text-sm text-danger">{errors.options}</p>}
                <Button variant="secondary" className="self-start" onClick={() => setDraft({ ...draft, options: [...draft.options, { label: "", value: "" }] })}>
                  Tambah opsi
                </Button>
                {draft.type === "checkbox" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {numberField("minSelected", "Minimal dipilih")}
                    {numberField("maxSelected", "Maksimal dipilih")}
                  </div>
                )}
              </fieldset>
            )}
            {draft.type === "identity" && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-text">Tipe identitas yang diterima</legend>
                {IDENTITY_TYPES.map((t) => (
                  <Checkbox
                    key={t.value}
                    id={`ff-idt-${t.value}`}
                    label={t.label}
                    checked={draft.identityTypes.includes(t.value)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        identityTypes: e.target.checked ? [...draft.identityTypes, t.value] : draft.identityTypes.filter((x) => x !== t.value),
                      })
                    }
                  />
                ))}
                <p className="text-sm text-muted">KTP wajib 16 digit angka. Nomor identitas disimpan terenkripsi dan tampil tersamar.</p>
              </fieldset>
            )}

            <Checkbox id="ff-required" label="Wajib diisi" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} />
            <Checkbox
              id="ff-active"
              label="Aktif"
              hint="Field nonaktif tidak ditanyakan ke pembeli baru, jawaban lama tetap tersimpan."
              checked={draft.isActive}
              onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
            />
            {formError && <Alert>{formError}</Alert>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Batal
              </Button>
              <Button type="submit" loading={saving}>
                {draft.id ? "Simpan field" : "Tambah field"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog open={removing !== null} onClose={() => setRemoving(null)} title="Hapus field">
        {removing && (
          <div className="flex flex-col gap-4">
            <p className="text-text">
              Hapus field <strong>{removing.label}</strong>? Field yang sudah punya jawaban tidak bisa dihapus, hanya dinonaktifkan.
            </p>
            {removeError && <Alert>{removeError}</Alert>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setRemoving(null)}>
                Batal
              </Button>
              <Button variant="danger" loading={saving} onClick={confirmRemove}>
                Hapus field
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
