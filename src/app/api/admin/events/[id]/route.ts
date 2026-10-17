import { NextResponse } from "next/server";
import { adminRoute, numericParam, UserError } from "@/lib/admin-route";
import { getAdminEvent, updateEvent } from "@/lib/catalog/event-service";
import { eventInput } from "@/lib/validation/catalog";

export const GET = adminRoute(null, async ({ params }) => {
  const event = await getAdminEvent(numericParam(params, "id"));
  if (!event) throw new UserError("Event tidak ditemukan.", 404);
  return NextResponse.json({ event });
});

export const PATCH = adminRoute(eventInput, async ({ admin, body, params }) =>
  NextResponse.json({ event: await updateEvent(admin.id, numericParam(params, "id"), body) }),
);
