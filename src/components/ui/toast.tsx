"use client";

import { useEffect } from "react";
import { AlertCircleIcon, CheckIcon, CloseIcon } from "@/components/icons";

export type ToastMessage = { id: number; tone: "success" | "error"; text: string };

/** Solid fills fixed in both themes: white text stays at 6.5:1 (error) and 5.5:1 (success), which the lighter dark-theme status tokens cannot give. */
const TONES = {
  success: { box: "bg-toast-success", Icon: CheckIcon },
  error: { box: "bg-toast-error", Icon: AlertCircleIcon },
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
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-transparent p-3 pr-2 text-sm font-medium text-white shadow-lg shadow-black/20 motion-safe:animate-[toast-in_200ms_ease-out] dark:border-white/15 dark:shadow-black/60 ${tone.box}`}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/15">
            <tone.Icon className="size-[18px]" />
          </span>
          <p className="min-w-0 flex-1 self-center leading-snug">{toast.text}</p>
          <button type="button" onClick={onClose} aria-label="Tutup notifikasi" className="-my-1 flex size-10 shrink-0 items-center justify-center rounded-md text-white/80 hover:bg-white/15 hover:text-white focus-visible:outline-white">
            <CloseIcon className="size-[18px]" />
          </button>
        </div>
      )}
    </div>
  );
}
