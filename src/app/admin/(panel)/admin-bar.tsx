import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { ADMIN_COOKIE } from "@/lib/admin-session";
import { adminFromCookie } from "@/lib/admin-service";
import { LogoutButton } from "./logout-button";
import { MobileMenu } from "./mobile-menu";

const NAV = [
  { href: "/admin", label: "Dasbor" },
  { href: "/admin/event-categories", label: "Kategori Event" },
  { href: "/admin/security", label: "Keamanan" },
];

function NavLinks() {
  return (
    <>
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-md px-3 py-2.5 text-sm font-medium text-text hover:bg-surface-muted"
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}

export async function AdminBar() {
  await connection();
  const admin = await adminFromCookie((await cookies()).get(ADMIN_COOKIE)?.value);
  if (!admin) redirect("/admin/login");
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2">
        <div className="flex items-center gap-2">
          <Link href="/admin" className="-ml-2 rounded-md px-2 py-2.5 text-base font-extrabold tracking-tight text-text">
            Anytix <span className="font-medium text-muted">Admin</span>
          </Link>
          <nav aria-label="Panel admin" className="hidden items-center gap-1 md:flex">
            <NavLinks />
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <span className="hidden max-w-[14rem] truncate px-2 text-sm text-muted lg:inline" title={admin.email}>
            {admin.email}
          </span>
          <ThemeToggle />
          <LogoutButton />
          <MobileMenu>
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
