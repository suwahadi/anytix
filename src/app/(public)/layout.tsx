import { getPublicCategories, getPublicSite } from "@/lib/public/catalog-queries";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const [site, categories] = await Promise.all([getPublicSite(), getPublicCategories()]);
  return (
    <>
      <a
        href="#konten"
        className="sr-only z-30 rounded-md bg-accent px-4 py-3 font-semibold text-on-accent focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Lewati ke konten
      </a>
      <SiteHeader site={site} />
      <main id="konten" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <SiteFooter site={site} categories={categories} />
    </>
  );
}
