import { cacheLife } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { MailIcon, WhatsAppIcon } from "@/components/icons";
import type { PublicCategory } from "@/lib/public/catalog-queries";
import { localPhone, whatsappUrl } from "@/lib/format";
import { footerColumns } from "@/lib/public/nav";
import type { SiteView } from "@/lib/settings-service";

/** `new Date()` in a prerendered component fails the build under Cache Components; a cached function may read the clock. */
async function copyrightYear(): Promise<number> {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

const LINK = "flex min-h-11 items-center gap-2 text-stone-300 underline-offset-4 hover:text-white hover:underline sm:min-h-9";

export async function SiteFooter({ site, categories }: { site: SiteView; categories: PublicCategory[] }) {
  const year = await copyrightYear();
  return (
    <footer className="border-t border-stone-800 bg-stone-950 text-sm text-stone-300">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:py-12">
        <div id="kontak" className="flex scroll-mt-20 flex-col gap-3">
          <Link href="/" className="w-fit text-2xl font-extrabold tracking-tight text-white">
            {site.logoPath ? <Image src={site.logoPath} alt={site.name} width={160} height={40} className="h-9 w-auto" /> : site.name}
          </Link>
          <p className="max-w-xs text-stone-300">Beli tiket event tanpa perlu daftar akun.</p>
          {(site.csWhatsapp || site.csEmail) && (
            <div className="flex flex-col">
              {site.csWhatsapp && (
                <a
                  href={whatsappUrl(site.csWhatsapp, site.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`WhatsApp ${localPhone(site.csWhatsapp)} (tab baru)`}
                  className={LINK}
                >
                  <WhatsAppIcon className="size-4 shrink-0" />
                  {localPhone(site.csWhatsapp)}
                </a>
              )}
              {site.csEmail && (
                <a href={`mailto:${site.csEmail}`} aria-label={`Email ${site.csEmail}`} className={LINK}>
                  <MailIcon className="size-4 shrink-0" />
                  {site.csEmail}
                </a>
              )}
            </div>
          )}
        </div>
        {footerColumns(categories).map((col) => (
          <nav key={col.title} aria-label={col.title} className="flex flex-col gap-1">
            <p className="mb-1 font-semibold text-white">{col.title}</p>
            {col.items.map((item) =>
              "soon" in item ? (
                <span key={item.label} title="Segera hadir" className="flex min-h-11 cursor-default items-center text-stone-500 sm:min-h-9">
                  {item.label}
                  <span className="sr-only"> (segera hadir)</span>
                </span>
              ) : (
                <Link key={item.label} href={item.href} className={LINK}>
                  {item.label}
                </Link>
              ),
            )}
          </nav>
        ))}
      </div>
      <div className="border-t border-stone-800">
        <p className="mx-auto w-full max-w-6xl px-4 py-5 text-center text-[0.7875rem] text-stone-400">
          Copyright © {year} {site.name}.
        </p>
      </div>
    </footer>
  );
}
