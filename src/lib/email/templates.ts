export const EMAIL_TYPES = ["awaiting_payment", "paid", "expired", "late_paid"] as const;
export type EmailType = (typeof EMAIL_TYPES)[number];
export type EmailTemplate = { subject: string; body: string };
export type EmailTemplates = Record<EmailType, EmailTemplate>;

export const EMAIL_PLACEHOLDERS = ["nama", "event", "invoice", "total", "batas_bayar", "tautan_pesanan"] as const;

export const EMAIL_TYPE_LABELS: Record<EmailType, string> = {
  awaiting_payment: "Menunggu pembayaran",
  paid: "Pembayaran berhasil",
  expired: "Pesanan kedaluwarsa",
  late_paid: "Pembayaran terlambat",
};

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplates = {
  awaiting_payment: {
    subject: "Selesaikan pembayaran {{invoice}}",
    body: "Halo {{nama}}, pesanan Anda untuk {{event}} sudah kami terima. Total yang perlu dibayar {{total}}. Bayar sebelum {{batas_bayar}}. Setelah itu slot tiket dilepas untuk pembeli lain.",
  },
  paid: {
    subject: "Pembayaran berhasil: {{event}}",
    body: "Halo {{nama}}, pembayaran pesanan {{invoice}} sudah kami terima. E-ticket Anda bisa dibuka kapan saja lewat tautan di bawah. Simpan email ini sampai hari acara.",
  },
  expired: {
    subject: "Pesanan {{invoice}} kedaluwarsa",
    body: "Halo {{nama}}, pesanan Anda untuk {{event}} dibatalkan karena pembayaran belum masuk sampai batas waktu. Kalau masih ingin datang, silakan pesan lagi.",
  },
  late_paid: {
    subject: "Pembayaran {{invoice}} masuk setelah batas waktu",
    body: "Halo {{nama}}, mohon maaf. Pembayaran Anda untuk {{event}} masuk setelah batas waktu, dan kuota tiket sudah habis. Pengelola akan menghubungi Anda untuk pengembalian dana.",
  },
};

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Unknown placeholders stay as typed, so a typo is visible in the preview instead of silently vanishing. */
export function fillPlaceholders(text: string, vars: Record<string, string>, escape: boolean): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, name: string) => {
    if (!(name in vars)) return match;
    return escape ? escapeHtml(vars[name]) : vars[name];
  });
}

export function unknownPlaceholders(text: string): string[] {
  const known: readonly string[] = EMAIL_PLACEHOLDERS;
  return [...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]).filter((n) => !known.includes(n));
}

export function mergeEmailTemplates(stored: Partial<Record<EmailType, Partial<EmailTemplate>>> | null | undefined): EmailTemplates {
  return Object.fromEntries(EMAIL_TYPES.map((t) => [t, { ...DEFAULT_EMAIL_TEMPLATES[t], ...stored?.[t] }])) as EmailTemplates;
}
