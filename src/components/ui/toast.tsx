"use client";

import { useEffect } from "react";
import { AlertCircleIcon, CheckIcon, CloseIcon } from "@/components/icons";

export type ToastMessage = { id: number; tone: "success" | "error"; text: string };

const TONES = {
  success: { box: "border-success", icon: "bg-success-soft text-success", Icon: CheckIcon },
  error: { box: "border-danger", icon: "bg-danger-soft text-danger", Icon: AlertCircleIcon },
} as const;

/** One message at a time: bottom of the screen on phones (thumb reach, clear of the header), top-right from `sm`. */
export function Toast({ toast, onClose, duration = 6000 }: { toast: ToastMessage | null; onClose: () => void; duration?: number }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [toast, onClose, duration]);

  const tone = toast ? TONES[toast.tone] : null;
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-20">
      {toast && tone && (
        <div
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-surface p-3 pr-2 text-sm text-text shadow-lg motion-safe:animate-[toast-in_200ms_ease-out] ${tone.box}`}
        >
          <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${tone.icon}`}>
            <tone.Icon className="size-[18px]" />
          </span>
          <p className="min-w-0 flex-1 self-center leading-snug">{toast.text}</p>
          <button type="button" onClick={onClose} aria-label="Tutup notifikasi" className="-my-1 flex size-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-muted hover:text-text">
            <CloseIcon className="size-[18px]" />
          </button>
        </div>
      )}
    </div>
  );
}
