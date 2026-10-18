import { cacheLife } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import type { PublicCategory } from "@/lib/public/catalog-queries";
import { footerColumns } from "@/lib/public/nav";
import type { SiteView } from "@/lib/settings-service";

/** `new Date()` in a prerendered component fails the build under Cache Components; a cached function may read the clock. */
async function copyrightYear(): Promise<number> {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

const LINK = "flex min-h-11 items-center text-stone-300 underline-offset-4 hover:text-white hover:underline sm:min-h-9";

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
              <p className="mt-2 font-semibold text-white">Bantuan pembeli</p>
              {site.csWhatsapp && (
                <a href={`https://wa.me/${site.csWhatsapp}`} className={LINK}>
                  WhatsApp +{site.csWhatsapp}
                </a>
              )}
              {site.csEmail && (
                <a href={`mailto:${site.csEmail}`} className={LINK}>
                  {site.csEmail}
                </a>
              )}
            </div>
          )}
        </div>
        {footerColumns(site, categories).map((col) => (
          <nav key={col.title} aria-label={col.title} className="flex flex-col gap-1">
            <p className="mb-1 font-semibold text-white">{col.title}</p>
            {col.items.map((item) =>
              "soon" in item ? (
                <span key={item.label} className="flex min-h-11 cursor-default items-center gap-1.5 text-stone-400 sm:min-h-9">
                  {item.label}
                  <span className="rounded bg-stone-800 px-1.5 py-0.5 text-[11px] font-semibold text-stone-300">Segera</span>
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
        <p className="mx-auto w-full max-w-6xl px-4 py-5 text-stone-400">
          © {year} {site.name}. Hak Cipta Dilindungi.
        </p>
      </div>
    </footer>
  );
}
