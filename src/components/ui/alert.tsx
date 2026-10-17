import type { ReactNode } from "react";

const TONES = {
  danger: "border-danger bg-danger-soft text-danger",
  success: "border-success bg-success-soft text-success",
  warning: "border-warning bg-warning-soft text-warning",
} as const;

export function Alert({ children, tone = "danger" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${TONES[tone]}`}>
      {children}
    </p>
  );
}
