import { getEnv } from "@/lib/env";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Server-side Turnstile check; any network or parsing failure counts as a failed check. */
export async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  if (!token) return false;
  const form = new URLSearchParams({ secret: getEnv().TURNSTILE_SECRET_KEY, response: token });
  if (ip) form.set("remoteip", ip);
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body: form, signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
