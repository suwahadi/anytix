import sharp from "sharp";

export type ImageType = "jpeg" | "png" | "webp" | "gif" | "avif";
export type VariantSize = "lg" | "md" | "thumb";

export const VARIANT_WIDTHS: Record<VariantSize, number> = { lg: 1600, md: 800, thumb: 400 };

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function detectImageType(buf: Buffer): ImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG)) return "png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  if (buf.length >= 6 && ["GIF87a", "GIF89a"].includes(buf.toString("ascii", 0, 6))) return "gif";
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp" && ["avif", "avis"].includes(buf.toString("ascii", 8, 12))) {
    return "avif";
  }
  return null;
}

export async function toWebpVariants(buf: Buffer): Promise<Record<VariantSize, Buffer>> {
  const sizes = Object.keys(VARIANT_WIDTHS) as VariantSize[];
  const outputs = await Promise.all(
    sizes.map((size) =>
      sharp(buf)
        .rotate()
        .resize({ width: VARIANT_WIDTHS[size], withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer(),
    ),
  );
  return Object.fromEntries(sizes.map((size, i) => [size, outputs[i]])) as Record<VariantSize, Buffer>;
}
