import { createHmac, randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_MS = 30_000;

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text.replace(/=+$/, "").toUpperCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function codeForCounter(key: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", key).update(msg).digest();
  const offset = h[h.length - 1] & 15;
  const bin = h.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 1_000_000).padStart(6, "0");
}

export function totpCode(secret: string, timeMs: number): string {
  return codeForCounter(base32Decode(secret), Math.floor(timeMs / STEP_MS));
}

export function verifyTotp(secret: string, code: string, timeMs = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const key = base32Decode(secret);
  const counter = Math.floor(timeMs / STEP_MS);
  return [-1, 0, 1].some((d) => codeForCounter(key, counter + d) === code);
}

export function totpUri(secret: string, email: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(email)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
