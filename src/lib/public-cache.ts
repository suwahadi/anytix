import { revalidateTag } from "next/cache";

export const TAG_CATEGORIES = "categories";
export const TAG_EVENTS = "events";
export const TAG_SITE = "site-settings";

export function eventTag(id: number): string {
  return `event-${id}`;
}

/** Route Handlers cannot use updateTag, so expire immediately to make the next public request fresh. */
export function invalidatePublic(...tags: string[]): void {
  for (const tag of new Set(tags)) revalidateTag(tag, { expire: 0 });
}
