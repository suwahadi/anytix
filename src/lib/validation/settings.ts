import { z } from "zod";
import { mediaPath } from "@/lib/validation/catalog";

/** Snap `enabled_payments` codes; all seven verified active in the Midtrans sandbox on 17 Oct 2026. */
export const PAYMENT_METHODS = [
  { key: "qris", code: "other_qris", label: "QRIS" },
  { key: "bca", code: "bca_va", label: "BCA" },
  { key: "bni", code: "bni_va", label: "BNI" },
  { key: "bri", code: "bri_va", label: "BRI" },
  { key: "mandiri", code: "echannel", label: "Mandiri" },
  { key: "permata", code: "permata_va", label: "Permata" },
  { key: "cimb", code: "cimb_va", label: "CIMB Niaga" },
] as const;

const VA_KEYS = ["bca", "bni", "bri", "mandiri", "permata", "cimb"] as const;
const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);
const int = (label: string, min: number, max: number) =>
  z
    .number({ message: `${label} harus angka.` })
    .int(`${label} harus bilangan bulat.`)
    .min(min, `${label} minimal ${min}.`)
    .max(max, `${label} maksimal ${max}.`);

export const transactionSettings = z.object({
  holdMinutes: int("Lama kunci slot", 1, 30),
  payMinutes: int("Batas bayar", 5, 1440),
  payGraceMinutes: int("Cadangan batas bayar", 0, 60),
  serviceFee: int("Biaya layanan", 0, 1_000_000),
  paymentMethods: z.object({
    qris: z.boolean(),
    va: z.object(Object.fromEntries(VA_KEYS.map((k) => [k, z.boolean()])) as Record<(typeof VA_KEYS)[number], z.ZodBoolean>),
  }),
}).superRefine((v, ctx) => {
  if (!v.paymentMethods.qris && !Object.values(v.paymentMethods.va).some(Boolean)) {
    ctx.addIssue({ code: "custom", path: ["paymentMethods"], message: "Aktifkan minimal satu metode pembayaran." });
  }
});
export type TransactionSettingsValues = z.infer<typeof transactionSettings>;

export function normalizeWhatsapp(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

export const siteSettings = z.object({
  name: z.string().trim().min(2, "Nama situs minimal 2 karakter.").max(60, "Nama situs maksimal 60 karakter."),
  logoPath: mediaPath,
  csWhatsapp: z
    .string()
    .trim()
    .transform(normalizeWhatsapp)
    .refine((v) => v === "" || /^62\d{8,13}$/.test(v), "Nomor WhatsApp tidak valid. Contoh: 0812xxxx atau +62812xxxx.")
    .default(""),
  csEmail: z.preprocess(emptyToUndefined, z.string().trim().email("Email tidak valid.").optional()),
  terms: z.string().max(100_000, "Teks S&K terlalu panjang.").default(""),
  privacy: z.string().max(100_000, "Teks kebijakan privasi terlalu panjang.").default(""),
});
export type SiteSettingsValues = z.infer<typeof siteSettings>;

export const smtpSettingsInput = z.object({
  host: z.string().trim().min(1, "Host wajib diisi.").max(200),
  port: int("Port", 1, 65535),
  user: z.string().trim().max(200).default(""),
  password: z.string().max(500).default(""),
  from: z
    .string()
    .trim()
    .min(3, "Alamat pengirim wajib diisi.")
    .max(200)
    .refine((v) => /^[^<>]*<[^\s@<>]+@[^\s@<>]+>$|^[^\s@<>]+@[^\s@<>]+$/.test(v), "Format: email@domain.com atau Nama <email@domain.com>."),
});
export type SmtpSettingsValues = z.infer<typeof smtpSettingsInput>;

export const smtpTestInput = z.object({ to: z.string().trim().email("Email penerima tidak valid.") });

export const SETTINGS_SCHEMAS = {
  transaction: transactionSettings,
  site: siteSettings,
  smtp: smtpSettingsInput,
} as const;
export type SettingsGroup = keyof typeof SETTINGS_SCHEMAS;
