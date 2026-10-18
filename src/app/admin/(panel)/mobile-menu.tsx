"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

export function MobileMenu({ email, children }: { email: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  function close() {
    if (ref.current) ref.current.open = false;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && ref.current?.open) {
      close();
      ref.current.querySelector("summary")?.focus();
    }
  }

  return (
    <details ref={ref} className="relative lg:hidden" onKeyDown={onKeyDown}>
      <summary className="inline-flex h-11 cursor-pointer list-none items-center rounded-md px-3 text-sm font-medium text-text hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
        Menu
      </summary>
      <nav
        aria-label="Panel admin"
        onClick={(e) => (e.target as HTMLElement).closest("a") && close()}
        className="absolute right-0 z-20 mt-2 flex w-56 flex-col rounded-lg border border-border bg-surface p-2"
      >
        <p className="truncate border-b border-border px-3 pb-2 pt-1 text-sm text-muted" title={email}>
          {email}
        </p>
        {children}
      </nav>
    </details>
  );
}
