import { VARIANT_WIDTHS } from "@/lib/image-service";
import { deleteObjects } from "@/lib/storage";

/** Deletes the WebP variants of media paths that an update dropped; storage errors are logged so the saved change still stands. */
export async function discardReplacedMedia(before: Array<string | null | undefined>, after: Array<string | null | undefined>): Promise<void> {
  const kept = new Set(after.filter(Boolean));
  const dropped = [...new Set(before.filter((p): p is string => Boolean(p) && !kept.has(p)))];
  if (dropped.length === 0) return;
  const objects = dropped.flatMap((base) => Object.keys(VARIANT_WIDTHS).map((size) => `${base}-${size}.webp`));
  await deleteObjects(objects).catch((e: unknown) => console.error(`media cleanup failed: ${e instanceof Error ? e.message : String(e)}`));
}
