import Link from "next/link";
import { connection } from "next/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { pageAdmin } from "@/lib/admin-page";
import { LogoutButton } from "./logout-button";
import { MobileMenu } from "./mobile-menu";

const NAV = [
  { href: "/admin", label: "Dasbor" },
  { href: "/admin/events", label: "Event" },
  { href: "/admin/orders", label: "Pesanan" },
  { href: "/admin/check-in", label: "Check-in" },
  { href: "/admin/event-categories", label: "Kategori Event" },
  { href: "/admin/content", label: "Konten" },
  { href: "/admin/settings", label: "Pengaturan" },
  { href: "/admin/admins", label: "Admin & Audit" },
  { href: "/admin/security", label: "Keamanan" },
];

function NavLinks() {
  return (
    <>
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="whitespace-nowrap rounded-md px-2.5 py-2.5 text-sm font-medium text-text hover:bg-surface-muted"
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}

export async function AdminBar() {
  await connection();
  await pageAdmin();
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2">
        <div className="flex items-center gap-2">
          <Link href="/admin" className="-ml-2 rounded-md px-2 py-2.5 text-base font-extrabold tracking-tight text-text">
            Anytix <span className="font-medium text-muted">Admin</span>
          </Link>
          <nav aria-label="Panel admin" className="hidden items-center gap-1 lg:flex">
            <NavLinks />
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <div className="hidden lg:block">
            <LogoutButton />
          </div>
          <MobileMenu footer={<LogoutButton inMenu />}>
            <NavLinks />
          </MobileMenu>
        </div>
      </div>
    </header>
  );
}

export function AdminBarFallback() {
  return <div className="h-[61px] border-b border-border bg-surface" aria-busy="true" />;
}
