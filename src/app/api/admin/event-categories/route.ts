import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/admin-route";
import { createEventCategory, listEventCategories } from "@/lib/catalog/event-category-service";
import { eventCategoryInput } from "@/lib/validation/catalog";

export const GET = adminRoute(null, async () => NextResponse.json({ categories: await listEventCategories() }));

export const POST = adminRoute(eventCategoryInput, async ({ admin, body }) =>
  NextResponse.json({ category: await createEventCategory(admin.id, body) }, { status: 201 }),
);
