import Link from "next/link";

const TABS = [
  { href: "/admin/admins", key: "admins", label: "Akun admin" },
  { href: "/admin/audit", key: "audit", label: "Audit log" },
] as const;

export function AdminTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Admin dan audit" className="mt-3 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold ${
            tab.key === active ? "border-accent text-accent-text" : "border-transparent text-muted hover:text-text"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
