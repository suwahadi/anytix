import type { ReactNode } from "react";

const TONES = {
  accent: "bg-accent-soft text-accent-text",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  muted: "bg-surface-muted text-muted",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}
