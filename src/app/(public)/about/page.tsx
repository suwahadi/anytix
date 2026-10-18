import type { Metadata } from "next";
import { getPublicPages } from "@/lib/public/catalog-queries";

export const metadata: Metadata = { title: "Tentang Kami" };

export default async function AboutPage() {
  const pages = await getPublicPages();
  return (
    <article className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:py-10">
      <h1 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl">Tentang Kami</h1>
      {pages.about ? (
        <div className="rich-text text-text" dangerouslySetInnerHTML={{ __html: pages.about }} />
      ) : (
        <p className="text-muted">Belum diisi pengelola.</p>
      )}
    </article>
  );
}
