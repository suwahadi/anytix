import { z } from "zod";

export const FIELD_TYPES = [
  "short_text",
  "long_text",
  "number",
  "date",
  "select",
  "radio",
  "checkbox",
  "chips",
  "identity",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  short_text: "Teks pendek",
  long_text: "Teks panjang",
  number: "Angka",
  date: "Tanggal",
  select: "Dropdown",
  radio: "Pilihan tunggal",
  checkbox: "Pilihan ganda",
  chips: "Tombol pilihan",
  identity: "Identitas",
};

export const OPTION_TYPES: FieldType[] = ["select", "radio", "checkbox", "chips"];

export const IDENTITY_TYPES = [
  { value: "KTP", label: "KTP" },
  { value: "SIM", label: "SIM" },
  { value: "PASPOR", label: "Paspor" },
  { value: "KARTU_PELAJAR", label: "Kartu Pelajar" },
] as const;

export type FieldValidation = {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  minDate?: string;
  maxDate?: string;
  minAge?: number;
  minSelected?: number;
  maxSelected?: number;
  identityTypes?: string[];
};

export type FormFieldDef = {
  id: number;
  key: string;
  label: string;
  type: FieldType;
  options: Array<{ label: string; value: string }>;
  validation: FieldValidation;
  required: boolean;
  helpText: string | null;
  placeholder: string | null;
  isActive: boolean;
  position: number;
};

export type IdentityAnswer = { type: string; number: string };

const REQUIRED = "Wajib diisi.";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function requiredOr(invalid?: string) {
  return { error: (iss: { input?: unknown }) => (iss.input === undefined ? REQUIRED : invalid) };
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object" && "type" in value && "number" in value) {
    const v = value as IdentityAnswer;
    return !v.type && !String(v.number ?? "").trim();
  }
  return false;
}

function isRealDate(value: string): boolean {
  return DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/** Full years between a YYYY-MM-DD birth date and today's date in Asia/Jakarta. */
function ageOn(birth: string, now: Date): number {
  const today = new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  const years = Number(today.slice(0, 4)) - Number(birth.slice(0, 4));
  return today.slice(5) < birth.slice(5) ? years - 1 : years;
}

function textSchema(v: FieldValidation, defaultMax: number) {
  let s = z.string(requiredOr()).trim();
  if (v.minLength) s = s.min(v.minLength, `Minimal ${v.minLength} karakter.`);
  s = s.max(v.maxLength ?? defaultMax, `Maksimal ${v.maxLength ?? defaultMax} karakter.`);
  if (v.pattern) {
    try {
      s = s.regex(new RegExp(v.pattern), "Format tidak sesuai.");
    } catch {}
  }
  return s;
}

function fieldSchema(field: FormFieldDef, now: Date): z.ZodType {
  const v = field.validation ?? {};
  const values = field.options.map((o) => o.value);
  switch (field.type) {
    case "short_text":
      return textSchema(v, 200);
    case "long_text":
      return textSchema(v, 2000);
    case "number": {
      let s = z.number(requiredOr("Masukkan angka."));
      if (v.min !== undefined) s = s.min(v.min, `Minimal ${v.min}.`);
      if (v.max !== undefined) s = s.max(v.max, `Maksimal ${v.max}.`);
      return z.preprocess((x) => (typeof x === "string" ? Number(x) : x), s);
    }
    case "date":
      return z
        .string(requiredOr())
        .refine(isRealDate, "Tanggal tidak valid.")
        .refine((d) => !v.minDate || d >= v.minDate, `Tanggal paling awal ${v.minDate}.`)
        .refine((d) => !v.maxDate || d <= v.maxDate, `Tanggal paling akhir ${v.maxDate}.`)
        .refine((d) => !v.minAge || !isRealDate(d) || ageOn(d, now) >= v.minAge, `Usia minimal ${v.minAge} tahun.`);
    case "select":
    case "radio":
    case "chips":
      return z.enum(values as [string, ...string[]], requiredOr("Pilih salah satu opsi."));
    case "checkbox": {
      let s = z.array(z.enum(values as [string, ...string[]], { error: "Pilihan tidak valid." }), requiredOr());
      if (v.minSelected) s = s.min(v.minSelected, `Pilih minimal ${v.minSelected}.`);
      if (v.maxSelected) s = s.max(v.maxSelected, `Pilih maksimal ${v.maxSelected}.`);
      return s;
    }
    case "identity": {
      const allowed = v.identityTypes?.length ? v.identityTypes : IDENTITY_TYPES.map((t) => t.value);
      return z
        .object(
          {
            type: z.enum(allowed as [string, ...string[]], { error: "Tipe identitas ini tidak diterima untuk event ini." }),
            number: z.string().trim(),
          },
          requiredOr(),
        )
        .superRefine((answer, ctx) => {
          if (answer.type === "KTP" && !/^\d{16}$/.test(answer.number)) {
            ctx.addIssue({ code: "custom", message: "Nomor KTP harus 16 digit angka." });
          } else if (answer.type !== "KTP" && !/^[A-Za-z0-9]{5,20}$/.test(answer.number)) {
            ctx.addIssue({ code: "custom", message: "Nomor identitas harus 5-20 huruf atau angka." });
          }
        });
    }
  }
}

export function buildAnswersSchema(fields: FormFieldDef[], now: Date = new Date()) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    if (!field.isActive) continue;
    const inner = fieldSchema(field, now);
    shape[field.key] = z.preprocess((x) => (isEmpty(x) ? undefined : x), field.required ? inner : inner.optional());
  }
  return z.object(shape);
}

export function fieldKeyFromLabel(label: string, taken: string[]): string {
  const base =
    label
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40)
      .replace(/_+$/, "") || "field";
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}
