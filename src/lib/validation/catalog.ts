import { z } from "zod";
import { FACILITY_KEYS } from "@/lib/facilities";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

export function slugField(max: number) {
  return z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(max, `Slug maksimal ${max} karakter.`)
      .regex(SLUG, "Slug hanya boleh huruf kecil, angka, dan tanda hubung.")
      .optional(),
  );
}

export const mediaPath = z.string().trim().max(200).nullable().optional();

export const eventCategoryInput = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(60, "Nama maksimal 60 karakter."),
  slug: slugField(60),
  icon: mediaPath,
  isActive: z.boolean().default(true),
});
export type EventCategoryValues = z.infer<typeof eventCategoryInput>;

export const reorderInput = z.object({
  ids: z.array(z.number().int().positive()).min(1, "Daftar urutan kosong."),
});

export const TIMEZONE_KEYS = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"] as const;
export type Timezone = (typeof TIMEZONE_KEYS)[number];

const httpsUrl = z
  .string()
  .trim()
  .max(500, "URL terlalu panjang.")
  .url("Masukkan URL lengkap, misalnya https://….")
  .refine((v) => v.startsWith("https://"), "URL harus diawali https://");
const optionalUrl = z.preprocess(emptyToUndefined, httpsUrl.optional());
const optionalText = (max: number, label: string) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max, `${label} maksimal ${max} karakter.`).optional());
const isoDate = (label: string) => z.iso.datetime({ offset: true, message: `${label} tidak valid.` });

export const eventInput = z
  .object({
    title: z.string().trim().min(3, "Judul minimal 3 karakter.").max(150, "Judul maksimal 150 karakter."),
    slug: slugField(80),
    eventCategoryId: z.number({ message: "Pilih kategori event." }).int().positive("Pilih kategori event."),
    description: z.string().max(50_000, "Deskripsi terlalu panjang.").default(""),
    terms: z.string().max(50_000, "Syarat & ketentuan terlalu panjang.").default(""),
    refundPolicy: z.string().trim().max(50_000, "Kebijakan refund terlalu panjang.").default(""),
    facilities: z
      .array(z.enum(FACILITY_KEYS))
      .default([])
      .refine((list) => new Set(list).size === list.length, "Fasilitas ganda."),
    startsAt: isoDate("Waktu mulai"),
    endsAt: isoDate("Waktu selesai"),
    timezone: z.enum(TIMEZONE_KEYS).default("Asia/Jakarta"),
    venue: z.string().trim().max(120, "Nama tempat maksimal 120 karakter.").default(""),
    city: z.string().trim().max(120, "Kota maksimal 120 karakter.").default(""),
    province: z.string().trim().max(120, "Provinsi maksimal 120 karakter.").default(""),
    mapUrl: optionalUrl,
    organizerName: z.string().trim().max(120, "Nama penyelenggara maksimal 120 karakter.").default(""),
    organizerLogoPath: mediaPath,
    posterPath: mediaPath,
    socialLinks: z
      .object({
        instagram: optionalUrl,
        tiktok: optionalUrl,
        x: optionalUrl,
        facebook: optionalUrl,
        youtube: optionalUrl,
        website: optionalUrl,
      })
      .default({}),
    status: z.enum(["draft", "published", "archived"]).default("draft"),
    saleStatus: z.enum(["on_sale", "paused", "closed"]).default("closed"),
    isFeatured: z.boolean().default(false),
    seo: z
      .object({ title: optionalText(70, "Judul SEO"), description: optionalText(160, "Deskripsi SEO") })
      .default({}),
  })
  .refine((v) => new Date(v.endsAt) >= new Date(v.startsAt), {
    path: ["endsAt"],
    message: "Waktu selesai harus sama atau setelah waktu mulai.",
  });
export type EventValues = z.infer<typeof eventInput>;

export const ticketCategoryInput = z
  .object({
    name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(80, "Nama maksimal 80 karakter."),
    description: z.string().max(20_000, "Deskripsi terlalu panjang.").default(""),
    price: z
      .number({ message: "Isi harga dalam rupiah." })
      .int("Harga harus bilangan bulat.")
      .min(1000, "Harga minimal Rp1.000.")
      .max(100_000_000, "Harga maksimal Rp100.000.000."),
    capacity: z
      .number({ message: "Isi kuota." })
      .int("Kuota harus bilangan bulat.")
      .min(0, "Kuota tidak boleh negatif.")
      .max(1_000_000, "Kuota maksimal 1.000.000."),
    saleStartsAt: isoDate("Mulai penjualan"),
    saleEndsAt: isoDate("Akhir penjualan"),
    maxPerOrder: z.number().int().min(1, "Minimal 1 per transaksi.").max(50, "Maksimal 50 per transaksi.").default(5),
    admitsPerUnit: z.number().int().min(1, "Minimal 1 orang.").max(20, "Maksimal 20 orang per tiket.").default(1),
    hasMerchandise: z.boolean().default(false),
    status: z.enum(["draft", "active", "hidden"]).default("draft"),
  })
  .refine((v) => new Date(v.saleEndsAt) > new Date(v.saleStartsAt), {
    path: ["saleEndsAt"],
    message: "Akhir penjualan harus setelah mulai penjualan.",
  });
export type TicketCategoryValues = z.infer<typeof ticketCategoryInput>;
