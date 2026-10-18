import type { Metadata } from "next";
import { NotFoundBody } from "@/app/(public)/not-found";
import { SiteFooter } from "@/app/(public)/site-footer";
import { SiteHeader } from "@/app/(public)/site-header";
import { getPublicCategories, getPublicSite } from "@/lib/public/catalog-queries";

export const metadata: Metadata = { title: "Halaman tidak ditemukan" };

/** Unmatched URLs render here outside the (public) layout, so this page adds that layout's header and footer itself. */
export default async function NotFound() {
  const [site, categories] = await Promise.all([getPublicSite(), getPublicCategories()]);
  return (
    <>
      <SiteHeader site={site} />
      <main id="konten" className="flex flex-1 flex-col justify-center">
        <NotFoundBody />
      </main>
      <SiteFooter site={site} categories={categories} />
    </>
  );
}
