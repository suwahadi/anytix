import { describe, expect, it } from "vitest";
import { buildAnswersSchema, fieldKeyFromLabel, type FormFieldDef } from "@/lib/form-schema";

let nextId = 1;
function field(over: Partial<FormFieldDef>): FormFieldDef {
  return {
    id: nextId++,
    key: "f",
    label: "Field",
    type: "short_text",
    options: [],
    validation: {},
    required: false,
    helpText: null,
    placeholder: null,
    isActive: true,
    position: 1,
    ...over,
  };
}

const NOW = new Date("2026-10-17T05:00:00Z");

function errors(fields: FormFieldDef[], answers: Record<string, unknown>) {
  const result = buildAnswersSchema(fields, NOW).safeParse(answers);
  if (result.success) return {};
  const first: Record<string, string> = {};
  for (const i of result.error.issues) first[String(i.path[0])] ??= i.message;
  return first;
}

const identity = (validation: FormFieldDef["validation"] = {}) =>
  field({ key: "identitas", type: "identity", required: true, validation });

describe("buildAnswersSchema", () => {
  it("KTP needs exactly 16 digits", () => {
    const f = [identity()];
    expect(errors(f, { identitas: { type: "KTP", number: "3201234567890001" } })).toEqual({});
    expect(errors(f, { identitas: { type: "KTP", number: "320123456789000" } }).identitas).toBe("Nomor KTP harus 16 digit angka.");
    expect(errors(f, { identitas: { type: "KTP", number: "32012345678900AB" } }).identitas).toBe("Nomor KTP harus 16 digit angka.");
  });

  it("identity limited to KTP", () => {
    const f = [identity({ identityTypes: ["KTP"] })];
    expect(errors(f, { identitas: { type: "SIM", number: "123456789012" } }).identitas).toBeDefined();
  });

  it("other identity types allow 5 to 20 letters or digits", () => {
    const f = [identity()];
    expect(errors(f, { identitas: { type: "PASPOR", number: "C1234567" } })).toEqual({});
    expect(errors(f, { identitas: { type: "SIM", number: "12-34" } }).identitas).toBe("Nomor identitas harus 5-20 huruf atau angka.");
    expect(errors(f, { identitas: { type: "SIM", number: "1234" } }).identitas).toBeDefined();
  });

  it("required fields report Wajib diisi", () => {
    const f = [identity(), field({ key: "nama_panggilan", required: true })];
    expect(errors(f, {})).toEqual({ identitas: "Wajib diisi.", nama_panggilan: "Wajib diisi." });
    expect(errors(f, { identitas: { type: "", number: "" }, nama_panggilan: "  " })).toEqual({
      identitas: "Wajib diisi.",
      nama_panggilan: "Wajib diisi.",
    });
  });

  it("min age", () => {
    const f = [field({ key: "lahir", type: "date", required: true, validation: { minAge: 17 } })];
    expect(errors(f, { lahir: "2009-10-18" }).lahir).toBe("Usia minimal 17 tahun.");
    expect(errors(f, { lahir: "2009-10-17" })).toEqual({});
    expect(errors(f, { lahir: "2008-01-01" })).toEqual({});
    expect(errors(f, { lahir: "2026-02-30" }).lahir).toBe("Tanggal tidak valid.");
  });

  it("checkbox min and max selected", () => {
    const options = ["a", "b", "c"].map((v) => ({ label: v.toUpperCase(), value: v }));
    const f = [field({ key: "minat", type: "checkbox", options, required: true, validation: { minSelected: 2, maxSelected: 2 } })];
    expect(errors(f, { minat: ["a"] }).minat).toBe("Pilih minimal 2.");
    expect(errors(f, { minat: ["a", "b", "c"] }).minat).toBe("Pilih maksimal 2.");
    expect(errors(f, { minat: ["a", "c"] })).toEqual({});
    expect(errors(f, { minat: [] }).minat).toBe("Wajib diisi.");
  });

  it("select rejects unknown option", () => {
    const f = [field({ key: "ukuran", type: "chips", required: true, options: [{ label: "M", value: "M" }, { label: "L", value: "L" }] })];
    expect(errors(f, { ukuran: "XXL" }).ukuran).toBe("Pilih salah satu opsi.");
    expect(errors(f, { ukuran: "L" })).toEqual({});
  });

  it("optional empty becomes undefined", () => {
    const f = [field({ key: "catatan", type: "long_text" }), field({ key: "umur", type: "number" })];
    expect(buildAnswersSchema(f, NOW).parse({ catatan: "", umur: "" })).toEqual({ catatan: undefined, umur: undefined });
    expect(buildAnswersSchema(f, NOW).parse({ umur: "21" })).toEqual({ umur: 21 });
  });

  it("inactive fields are ignored", () => {
    const f = [field({ key: "lama", required: true, isActive: false })];
    expect(errors(f, {})).toEqual({});
  });

  it("pattern and length applied to short text", () => {
    const f = [field({ key: "kode", required: true, validation: { pattern: "^[A-Z]{3}$", minLength: 3, maxLength: 3 } })];
    expect(errors(f, { kode: "abc" }).kode).toBe("Format tidak sesuai.");
    expect(errors(f, { kode: "AB" }).kode).toBe("Minimal 3 karakter.");
    expect(errors(f, { kode: "ABC" })).toEqual({});
  });
});

describe("fieldKeyFromLabel", () => {
  it("makes snake_case ASCII keys", () => {
    expect(fieldKeyFromLabel("Ukuran Baju", [])).toBe("ukuran_baju");
    expect(fieldKeyFromLabel("Nomor Identitas (KTP/SIM)", [])).toBe("nomor_identitas_ktp_sim");
  });

  it("adds a suffix when taken", () => {
    expect(fieldKeyFromLabel("Ukuran Baju", ["ukuran_baju"])).toBe("ukuran_baju_2");
    expect(fieldKeyFromLabel("Ukuran Baju", ["ukuran_baju", "ukuran_baju_2"])).toBe("ukuran_baju_3");
  });

  it("falls back to field", () => {
    expect(fieldKeyFromLabel("!!!", [])).toBe("field");
  });
});
