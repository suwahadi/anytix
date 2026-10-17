"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

export const EVENT_TABS = [{ suffix: "", label: "Detail" }];

export function EventTabs() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  return (
    <>
      <Link href="/admin/events" className="text-sm font-medium text-accent-text underline underline-offset-4">
        Kembali ke daftar event
      </Link>
      <nav aria-label="Bagian event" className="mt-3 flex gap-1 overflow-x-auto border-b border-border">
        {EVENT_TABS.map((tab) => {
          const href = `/admin/events/${id}${tab.suffix}`;
          const current = pathname === href;
          return (
            <Link
              key={tab.label}
              href={href}
              aria-current={current ? "page" : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold ${
                current ? "border-accent text-accent-text" : "border-transparent text-muted hover:text-text"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
