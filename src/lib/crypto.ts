import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

function dataKey(): Buffer {
  return Buffer.from(getEnv().DATA_ENCRYPTION_KEY, "base64");
}

/** AES-256-GCM; output layout is iv(12) | tag(16) | ciphertext. */
export function encrypt(plain: string, key: Buffer = dataKey()): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decrypt(data: Buffer, key: Buffer = dataKey()): string {
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}

function mac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function sign(value: string, secret: string = getEnv().COOKIE_SECRET): string {
  return `${value}.${mac(value, secret)}`;
}

export function verify(signed: string, secret: string = getEnv().COOKIE_SECRET): string | null {
  const dot = signed.lastIndexOf(".");
  if (dot <= 0) return null;
  const value = signed.slice(0, dot);
  const given = Buffer.from(signed.slice(dot + 1));
  const expected = Buffer.from(mac(value, secret));
  return given.length === expected.length && timingSafeEqual(given, expected) ? value : null;
}

export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}
