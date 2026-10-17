import { NextResponse } from "next/server";
import { adminRoute, numericParam } from "@/lib/admin-route";
import { createTicketCategory, listTicketCategories } from "@/lib/catalog/ticket-category-service";
import { ticketCategoryInput } from "@/lib/validation/catalog";

export const GET = adminRoute(null, async ({ params }) =>
  NextResponse.json({ categories: await listTicketCategories(numericParam(params, "id")) }),
);

export const POST = adminRoute(ticketCategoryInput, async ({ admin, body, params }) =>
  NextResponse.json({ category: await createTicketCategory(admin.id, numericParam(params, "id"), body) }, { status: 201 }),
);
