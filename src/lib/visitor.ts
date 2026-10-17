import { randomUUID } from "node:crypto";
import { sign, verify } from "@/lib/crypto";

export const VISITOR_COOKIE = "vid";
export const VISITOR_MAX_AGE_SEC = 365 * 24 * 3600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function newVisitorCookie(): { id: string; value: string } {
  const id = randomUUID();
  return { id, value: sign(id) };
}

export function readVisitorId(value?: string): string | null {
  if (!value) return null;
  const id = verify(value);
  return id && UUID.test(id) ? id : null;
}
