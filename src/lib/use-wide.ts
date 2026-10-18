"use client";

import { useSyncExternalStore } from "react";

const WIDE = "(min-width: 40rem)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True from the `sm` breakpoint up; the server and the first paint assume a phone. */
export function useWide(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => false);
}
