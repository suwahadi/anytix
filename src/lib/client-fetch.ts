export type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; fields?: Record<string, string>; body?: Record<string, unknown> };

const TIMEOUT_MS = 15_000;

/** JSON request with the 15 second timeout from PRD §17; never throws. */
export async function requestJson<T>(
  url: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<FetchResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: { ...(init.body === undefined ? {} : { "content-type": "application/json" }), ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data: data as T };
    const failure = data as { error?: string; fields?: Record<string, string> };
    return { ok: false, status: res.status, error: failure.error ?? "Terjadi kesalahan. Coba lagi.", fields: failure.fields, body: data as Record<string, unknown> };
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "AbortError";
    return {
      ok: false,
      status: 0,
      error: timedOut ? "Server tidak merespons dalam 15 detik. Coba lagi." : "Koneksi terputus. Periksa internet lalu coba lagi.",
    };
  } finally {
    clearTimeout(timer);
  }
}
