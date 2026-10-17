import { NextResponse } from "next/server";
import { adminRoute, numericParam } from "@/lib/admin-route";
import { removeTicketCategory, updateTicketCategory } from "@/lib/catalog/ticket-category-service";
import { ticketCategoryInput } from "@/lib/validation/catalog";

export const PATCH = adminRoute(ticketCategoryInput, async ({ admin, body, params }) =>
  NextResponse.json({
    category: await updateTicketCategory(admin.id, numericParam(params, "id"), numericParam(params, "categoryId"), body),
  }),
);

export const DELETE = adminRoute(null, async ({ admin, params }) => {
  await removeTicketCategory(admin.id, numericParam(params, "id"), numericParam(params, "categoryId"));
  return NextResponse.json({ ok: true });
});
