import { getPublicCategories, getPublicSite } from "@/lib/public/catalog-queries";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const [site, categories] = await Promise.all([getPublicSite(), getPublicCategories()]);
  return (
    <>
      <SiteHeader site={site} />
      <main className="flex-1">{children}</main>
      <SiteFooter site={site} categories={categories} />
    </>
  );
}
