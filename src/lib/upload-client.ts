import type { MEDIA_KINDS } from "@/lib/validation/catalog";

const MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";

/** Browser upload to /api/admin/uploads; resolves to the stored base path or a message ready to show. */
export async function uploadImage(file: File, kind: (typeof MEDIA_KINDS)[number]): Promise<{ base: string } | { error: string }> {
  if (file.size > MAX_BYTES) return { error: "Ukuran file maksimal 10 MB." };
  const form = new FormData();
  form.set("file", file);
  form.set("kind", kind);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch("/api/admin/uploads", { method: "POST", body: form, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { base: data.base as string } : { error: data.error ?? "Unggah gagal. Coba lagi." };
  } catch {
    return { error: "Unggah terputus atau terlalu lama. Periksa koneksi lalu coba lagi." };
  } finally {
    clearTimeout(timer);
  }
}
