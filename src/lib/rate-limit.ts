import { getEnv } from "@/lib/env";

// shortcut: per-process memory, only correct for a single instance; move to Postgres or Cloudflare when scaling horizontally
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (windows.size > 10_000) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  }
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  w.count += 1;
  return w.count <= limit;
}

/** Behind Nginx (TRUST_PROXY) only X-Real-IP counts, because Nginx overwrites it while clients can forge the other headers. */
export function clientIp(headers: Headers, trustProxy: boolean = getEnv().TRUST_PROXY): string {
  if (trustProxy) return headers.get("x-real-ip") ?? "local";
  return headers.get("x-real-ip") ?? headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
}

/** Per-IP limits scale with RATE_LIMIT_SCALE, so a load test from one machine can raise them without a code change. */
export function ipLimit(base: number, scale: number = getEnv().RATE_LIMIT_SCALE): number {
  return Math.max(1, Math.round(base * scale));
}
