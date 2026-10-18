import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { SearchIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { publicNav } from "@/lib/public/nav";
import type { SiteView } from "@/lib/settings-service";
import { MobileNav, MobileNavFallback, NavPills, PillList } from "./nav-links";

export function SiteHeader({ site }: { site: SiteView }) {
  const items = publicNav(site);
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4">
        <Link href="/" className="-ml-2 mr-auto rounded-md px-2 py-2 text-xl font-extrabold tracking-tight text-text lg:mr-0">
          {site.logoPath ? <Image src={site.logoPath} alt={site.name} width={160} height={40} preload className="h-8 w-auto" /> : site.name}
        </Link>
        <nav aria-label="Menu utama" className="mx-auto hidden lg:block">
          <Suspense fallback={<PillList items={items} pathname="" />}>
            <NavPills items={items} />
          </Suspense>
        </nav>
        <div className="flex items-center gap-1">
          <Link href="/events?fokus=cari" aria-label="Cari event" title="Cari event" className="inline-flex size-11 items-center justify-center rounded-md text-text hover:bg-surface-muted">
            <SearchIcon />
          </Link>
          <ThemeToggle />
          <Suspense fallback={<MobileNavFallback />}>
            <MobileNav items={items} />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
