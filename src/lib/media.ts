export type MediaSize = "lg" | "md" | "thumb";

/** Client-safe public URL of an uploaded WebP variant; `base` is what the upload API returned. */
export function mediaUrl(base: string, size: MediaSize): string {
  return `${process.env.NEXT_PUBLIC_MEDIA_BASE_URL}/${base}-${size}.webp`;
}
