"use client";

import { mediaUrl } from "@/lib/media";

/** Uploads are stored as fixed WebP variants (thumb 400, md 800, lg 1600), so pick the smallest one that covers `width`. */
export default function imageLoader({ src, width }: { src: string; width: number }): string {
  if (/^(https?:|data:|\/)/.test(src)) return src;
  return mediaUrl(src, width <= 400 ? "thumb" : width <= 800 ? "md" : "lg");
}
