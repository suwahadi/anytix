import type { MetadataRoute } from "next";
import { getEnv } from "@/lib/env";
import { getPublishedSlugs } from "@/lib/public/catalog-queries";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getEnv().APP_URL;
  const slugs = await getPublishedSlugs();
  return [
    { url: `${base}/` },
    { url: `${base}/events` },
    ...slugs.flatMap((slug) => [{ url: `${base}/events/${slug}` }, { url: `${base}/events/${slug}/tickets` }]),
    { url: `${base}/terms` },
    { url: `${base}/privacy` },
  ];
}
