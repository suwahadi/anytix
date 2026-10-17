import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPublicSite } from "@/lib/public/catalog-queries";

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const site = await getPublicSite();
  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-1 px-4">
          <Link href="/" className="-ml-2 mr-auto rounded-md px-2 py-2 text-xl font-extrabold tracking-tight text-text">
            {site.logoPath ? (
              <Image src={site.logoPath} alt={site.name} width={160} height={40} preload className="h-8 w-auto" />
            ) : (
              site.name
            )}
          </Link>
          <Link href="/events" className="inline-flex h-11 items-center rounded-md px-3 text-sm font-semibold text-text hover:bg-surface-muted">
            Jelajah Event
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 text-sm sm:flex-row sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="font-bold text-text">{site.name}</p>
            <p className="text-muted">Beli tiket event tanpa perlu daftar akun.</p>
          </div>
          {(site.csWhatsapp || site.csEmail) && (
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-text">Bantuan pembeli</p>
              {site.csWhatsapp && (
                <a href={`https://wa.me/${site.csWhatsapp}`} className="flex min-h-11 items-center text-muted underline-offset-4 hover:text-text hover:underline">
                  WhatsApp +{site.csWhatsapp}
                </a>
              )}
              {site.csEmail && (
                <a href={`mailto:${site.csEmail}`} className="flex min-h-11 items-center text-muted underline-offset-4 hover:text-text hover:underline">
                  {site.csEmail}
                </a>
              )}
            </div>
          )}
          <nav aria-label="Informasi" className="flex flex-col gap-1">
            <Link href="/terms" className="flex min-h-11 items-center text-muted underline-offset-4 hover:text-text hover:underline">
              Syarat & ketentuan
            </Link>
            <Link href="/privacy" className="flex min-h-11 items-center text-muted underline-offset-4 hover:text-text hover:underline">
              Kebijakan privasi
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
