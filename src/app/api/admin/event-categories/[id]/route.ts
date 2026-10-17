import { NextResponse } from "next/server";
import { adminRoute, numericParam } from "@/lib/admin-route";
import { removeEventCategory, updateEventCategory } from "@/lib/catalog/event-category-service";
import { eventCategoryInput } from "@/lib/validation/catalog";

export const PATCH = adminRoute(eventCategoryInput, async ({ admin, body, params }) =>
  NextResponse.json({ category: await updateEventCategory(admin.id, numericParam(params, "id"), body) }),
);

export const DELETE = adminRoute(null, async ({ admin, params }) => {
  await removeEventCategory(admin.id, numericParam(params, "id"));
  return NextResponse.json({ ok: true });
});
