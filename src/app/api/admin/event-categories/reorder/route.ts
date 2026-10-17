import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/admin-route";
import { reorderEventCategories } from "@/lib/catalog/event-category-service";
import { reorderInput } from "@/lib/validation/catalog";

export const PUT = adminRoute(reorderInput, async ({ admin, body }) => {
  await reorderEventCategories(admin.id, body.ids);
  return NextResponse.json({ ok: true });
});
