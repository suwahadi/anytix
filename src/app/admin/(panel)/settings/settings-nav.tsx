import Link from "next/link";

const TABS = [
  { key: "transaction", href: "/admin/settings", label: "Transaksi" },
  { key: "site", href: "/admin/settings/site", label: "Situs" },
  { key: "email", href: "/admin/settings/email", label: "Email" },
] as const;

export function SettingsNav({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <>
      <h1 className="text-2xl font-bold text-text">Pengaturan</h1>
      <nav aria-label="Bagian pengaturan" className="mt-3 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border">
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
    </>
  );
}
