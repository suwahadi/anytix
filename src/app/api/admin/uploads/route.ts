import { NextResponse, type NextRequest } from "next/server";
import { foreignOrigin } from "@/lib/admin-route";
import { requireAdmin } from "@/lib/admin-service";
import { randomToken } from "@/lib/crypto";
import { detectImageType, toWebpVariants, VARIANT_WIDTHS, type VariantSize } from "@/lib/image-service";
import { mediaUrl, uploadObject } from "@/lib/storage";
import { MEDIA_KINDS } from "@/lib/validation/catalog";

const MAX_BYTES = 10 * 1024 * 1024;
const KINDS = new Set<string>(MEDIA_KINDS);
const tooBig = () => NextResponse.json({ error: "Ukuran file maksimal 10 MB." }, { status: 413 });

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Sesi berakhir. Silakan masuk lagi." }, { status: 401 });
  }
  if (foreignOrigin(req)) return NextResponse.json({ error: "Permintaan ditolak." }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) return tooBig();

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = String(form?.get("kind") ?? "");
  if (!(file instanceof File) || !KINDS.has(kind)) {
    return NextResponse.json({ error: "Pilih file gambar dan jenis unggahan yang valid." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return tooBig();

  const buf = Buffer.from(await file.arrayBuffer());
  const unsupported = NextResponse.json({ error: "Format harus JPG, PNG, WebP, GIF, atau AVIF." }, { status: 415 });
  if (!detectImageType(buf)) return unsupported;
  const variants = await toWebpVariants(buf).catch(() => null);
  if (!variants) return unsupported;

  const base = `${kind}/${new Date().getFullYear()}/${randomToken(9)}`;
  const sizes = Object.keys(VARIANT_WIDTHS) as VariantSize[];
  await Promise.all(sizes.map((size) => uploadObject(`${base}-${size}.webp`, variants[size], "image/webp")));
  return NextResponse.json({
    base,
    urls: Object.fromEntries(sizes.map((size) => [size, mediaUrl(base, size)])),
  });
}
