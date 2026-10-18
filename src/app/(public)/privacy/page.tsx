import type { Metadata } from "next";
import { getPublicSite } from "@/lib/public/catalog-queries";

export const metadata: Metadata = { title: "Kebijakan Privasi" };

export default async function PrivacyPage() {
  const site = await getPublicSite();
  return (
    <article className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl">Kebijakan Privasi</h1>
        {site.privacy && site.privacyUpdatedAt && (
          <p className="text-sm text-muted">
            Terakhir diperbarui {new Date(site.privacyUpdatedAt).toLocaleDateString("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" })}
          </p>
        )}
      </div>
      {site.privacy ? (
        <div className="rich-text text-text" dangerouslySetInnerHTML={{ __html: site.privacy }} />
      ) : (
        <p className="text-muted">Belum diisi pengelola.</p>
      )}
    </article>
  );
}
