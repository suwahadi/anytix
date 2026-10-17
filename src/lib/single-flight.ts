const inflight = new Map<string, Promise<unknown>>();

/** Runs `fn` once per key while a call is pending; callers share one result, so a shared Response must be read through `.clone()` (a body reads once). */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
