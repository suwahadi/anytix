"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

const TABS = [
  { key: "detail", suffix: "", label: "Detail" },
  { key: "tickets", suffix: "/tickets", label: "Kategori Tiket" },
  { key: "form", suffix: "/form", label: "Form Pemesan" },
] as const;

export type EventTabKey = (typeof TABS)[number]["key"];

export function EventTabs({ active }: { active: EventTabKey }) {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <Link href="/admin/events" className="text-sm font-medium text-accent-text underline underline-offset-4">
        Kembali ke daftar event
      </Link>
      <nav aria-label="Bagian event" className="mt-3 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border">
        {TABS.map((tab) => {
          const current = tab.key === active;
          return (
            <Link
              key={tab.key}
              href={`/admin/events/${id}${tab.suffix}`}
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
