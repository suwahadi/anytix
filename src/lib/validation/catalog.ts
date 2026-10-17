import { z } from "zod";

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
