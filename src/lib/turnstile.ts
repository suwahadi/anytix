import { getEnv } from "@/lib/env";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Cloudflare's dummy secrets answer with hostname "example.com", so the hostname check only applies to real keys. */
const TEST_SECRET = /^[123]x000/;

/** Server-side Turnstile check; any network or parsing failure counts as a failed check. */
export async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  if (!token) return false;
  const env = getEnv();
  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (ip) form.set("remoteip", ip);
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body: form, signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as { success?: boolean; hostname?: string };
    if (data.success !== true) return false;
    return TEST_SECRET.test(env.TURNSTILE_SECRET_KEY) || data.hostname === new URL(env.APP_URL).hostname;
  } catch {
    return false;
  }
}
