"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { resolveTheme, THEME_STORAGE_KEY } from "@/lib/theme";

type Mode = "system" | "light" | "dark";

const ORDER: Mode[] = ["system", "light", "dark"];
const LABELS: Record<Mode, string> = { system: "Ikuti sistem", light: "Terang", dark: "Gelap" };
const listeners = new Set<() => void>();

function readMode(): Mode {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function Icon({ mode }: { mode: Mode }) {
  if (mode === "light") {
    return (
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  if (mode === "dark") {
    return (
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" strokeLinecap="round" />
    </svg>
  );
}

export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, readMode, () => "system" as Mode);

  // React Strict Mode in dev can drop the attribute the head script set, so re-apply it here.
  useLayoutEffect(() => {
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = resolveTheme(mode === "system" ? null : mode, systemDark);
  }, [mode]);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}
    listeners.forEach((listener) => listener());
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Tema: ${LABELS[mode]}. Ketuk untuk mengganti.`}
      title={`Tema: ${LABELS[mode]}`}
      className="inline-flex size-11 items-center justify-center rounded-md text-text hover:bg-surface-muted"
    >
      <Icon mode={mode} />
    </button>
  );
}
