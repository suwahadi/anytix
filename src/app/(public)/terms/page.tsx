import type { Metadata } from "next";
import { getPublicSite } from "@/lib/public/catalog-queries";

export const metadata: Metadata = { title: "Syarat & ketentuan" };

export default async function TermsPage() {
  const site = await getPublicSite();
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl">Syarat & ketentuan</h1>
      {site.terms ? (
        <div className="rich-text text-text" dangerouslySetInnerHTML={{ __html: site.terms }} />
      ) : (
        <p className="text-muted">Belum diisi pengelola.</p>
      )}
    </article>
  );
}
