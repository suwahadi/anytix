import { sign, verify } from "@/lib/crypto";

export const ADMIN_COOKIE = "admin_session";
export const ADMIN_2FA_COOKIE = "admin_2fa";
export const SESSION_TTL_MS = 12 * 3_600_000;
export const TWO_FA_TTL_MS = 5 * 60_000;

export type SessionPurpose = "session" | "2fa";

export function createSessionValue(
  adminId: number,
  now = Date.now(),
  ttlMs = SESSION_TTL_MS,
  purpose: SessionPurpose = "session",
): string {
  return sign(`${purpose}.${adminId}.${now + ttlMs}`);
}

export function readSessionValue(
  value: string | undefined,
  now = Date.now(),
  purpose: SessionPurpose = "session",
): number | null {
  if (!value) return null;
  const payload = verify(value);
  if (!payload) return null;
  const [kind, rawId, rawExp] = payload.split(".");
  const id = Number(rawId);
  const exp = Number(rawExp);
  if (kind !== purpose || !Number.isInteger(id) || !Number.isFinite(exp) || exp <= now) return null;
  return id;
}

export function cookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: (process.env.APP_URL ?? "").startsWith("https"),
    maxAge: maxAgeSec,
  };
}
