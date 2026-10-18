"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CloseIcon, MenuIcon } from "@/components/icons";
import { isActive, type NavItem } from "@/lib/public/nav";

function Soon({ label, className }: { label: string; className: string }) {
  return (
    <span className={className}>
      {label}
      <span className="ml-1.5 rounded bg-surface-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted">Segera</span>
    </span>
  );
}

export function NavPills({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex items-center gap-1 rounded-full bg-surface-muted p-1">
      {items.map((item) => (
        <li key={item.label}>
          {"soon" in item ? (
            <Soon label={item.label} className="inline-flex h-9 cursor-default items-center px-3 text-sm font-medium text-muted" />
          ) : (
            <Link
              href={item.href}
              aria-current={isActive(item, pathname) ? "page" : undefined}
              className={`inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
                isActive(item, pathname) ? "bg-accent text-on-accent" : "text-text hover:bg-surface"
              }`}
            >
              {item.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const [shownFor, setShownFor] = useState(pathname);

  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="public-mobile-nav"
        aria-label={open ? "Tutup menu" : "Buka menu"}
        className="inline-flex size-11 items-center justify-center rounded-md text-text hover:bg-surface-muted"
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>
      {open && (
        <nav id="public-mobile-nav" aria-label="Menu utama" className="absolute inset-x-0 top-full z-30 border-b border-border bg-surface shadow-sm">
          <ul className="mx-auto flex w-full max-w-6xl flex-col px-4 py-2">
            {items.map((item) => (
              <li key={item.label}>
                {"soon" in item ? (
                  <Soon label={item.label} className="flex min-h-12 cursor-default items-center text-base font-medium text-muted" />
                ) : (
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive(item, pathname) ? "page" : undefined}
                    className={`flex min-h-12 items-center text-base font-semibold ${isActive(item, pathname) ? "text-accent-text" : "text-text"}`}
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
