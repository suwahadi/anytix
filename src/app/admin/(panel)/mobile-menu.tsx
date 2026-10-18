"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { MenuIcon } from "@/components/icons";

export function MobileMenu({ children, footer }: { children: ReactNode; footer: ReactNode }) {
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
      <summary className="inline-flex h-11 cursor-pointer list-none items-center gap-2 rounded-md px-3 text-sm font-medium text-text hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
        <MenuIcon className="size-5" />
        Menu
      </summary>
      <div className="absolute right-0 z-20 mt-2 flex w-60 flex-col rounded-lg border border-border bg-surface p-2 shadow-lg">
        <nav aria-label="Panel admin" onClick={(e) => (e.target as HTMLElement).closest("a") && close()} className="flex flex-col">
          {children}
        </nav>
        <div className="mt-1 border-t border-border pt-1">{footer}</div>
      </div>
    </details>
  );
}
