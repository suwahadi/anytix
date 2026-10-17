import { requireEnv } from "@/lib/env";
import type { VariantSize } from "@/lib/image-service";

const BUCKET = "media";

function storageHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  // New sb_secret_ keys are not JWTs and go in apikey only; legacy service_role JWTs also need Authorization.
  return { apikey: key, ...(key.startsWith("eyJ") ? { authorization: `Bearer ${key}` } : {}), ...extra };
}

function storageUrl(path: string): string {
  return `${requireEnv("SUPABASE_URL").replace(/\/$/, "")}/storage/v1/${path}`;
}

export async function uploadObject(path: string, body: Buffer, contentType: string): Promise<void> {
  const res = await fetch(storageUrl(`object/${BUCKET}/${path}`), {
    method: "POST",
    headers: storageHeaders({ "content-type": contentType, "cache-control": "max-age=31536000", "x-upsert": "false" }),
    body: new Uint8Array(body),
  });
  if (!res.ok) throw new Error(`Storage upload failed (${res.status}): ${await res.text()}`);
}

export async function deleteObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const res = await fetch(storageUrl(`object/${BUCKET}`), {
    method: "DELETE",
    headers: storageHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!res.ok) throw new Error(`Storage delete failed (${res.status}): ${await res.text()}`);
}

export function mediaUrl(base: string, size: VariantSize): string {
  return storageUrl(`object/public/${BUCKET}/${base}-${size}.webp`);
}
