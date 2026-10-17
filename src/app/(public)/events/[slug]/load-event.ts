import { notFound, permanentRedirect } from "next/navigation";
import { getPublicEvent, getPublishedSlugs, resolvePublicSlug, type PublicEvent } from "@/lib/public/catalog-queries";

/** An empty list is a build error with Cache Components, so a placeholder slug stands in (it resolves to 404). */
export async function publishedSlugParams(): Promise<Array<{ slug: string }>> {
  const slugs = await getPublishedSlugs();
  return slugs.length > 0 ? slugs.map((slug) => ({ slug })) : [{ slug: "__none__" }];
}

/** Must run before any Suspense boundary so an unknown slug is a real 404 and an old slug a real 308. */
export async function loadEvent(slug: string, suffix = ""): Promise<PublicEvent> {
  const resolved = await resolvePublicSlug(slug);
  if (!resolved) notFound();
  if (resolved.redirected) permanentRedirect(`/events/${resolved.currentSlug}${suffix}`);
  const event = await getPublicEvent(resolved.eventId);
  if (!event) notFound();
  return event;
}
