import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-session";
import { adminFromCookie } from "@/lib/admin-service";
import { LogoutButton } from "./logout-button";

export async function AdminBar() {
  await connection();
  const admin = await adminFromCookie((await cookies()).get(ADMIN_COOKIE)?.value);
  if (!admin) redirect("/admin/login");
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
      <nav aria-label="Panel admin" className="flex items-center gap-1 text-sm">
        <Link href="/admin" className="rounded-md px-3 py-2.5 font-semibold text-zinc-900 hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-zinc-800">
          Anytix Admin
        </Link>
        <Link href="/admin/security" className="rounded-md px-3 py-2.5 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
          Keamanan
        </Link>
      </nav>
      <div className="flex items-center gap-3 text-sm">
        <span className="max-w-[16rem] truncate text-zinc-600 dark:text-zinc-400" title={admin.email}>
          {admin.email}
        </span>
        <LogoutButton />
      </div>
    </header>
  );
}

export function AdminBarFallback() {
  return <div className="h-[61px] border-b border-zinc-200 dark:border-zinc-800" aria-busy="true" />;
}
