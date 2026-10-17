"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-0 text-text backdrop:bg-black/60"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="-mr-2 -mt-1 inline-flex size-10 items-center justify-center rounded-md text-muted hover:bg-surface-muted hover:text-text"
          aria-label="Tutup"
        >
          <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">{footer}</div>}
    </dialog>
  );
}
