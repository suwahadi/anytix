import { NextResponse } from "next/server";
import { adminRoute, numericParam } from "@/lib/admin-route";
import { reorderTicketCategories } from "@/lib/catalog/ticket-category-service";
import { reorderInput } from "@/lib/validation/catalog";

export const PUT = adminRoute(reorderInput, async ({ admin, body, params }) => {
  await reorderTicketCategories(admin.id, numericParam(params, "id"), body.ids);
  return NextResponse.json({ ok: true });
});
