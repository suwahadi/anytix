import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/admin-route";
import { createEvent, listAdminEvents } from "@/lib/catalog/event-service";
import { eventInput } from "@/lib/validation/catalog";

export const GET = adminRoute(null, async ({ req }) => {
  const params = req.nextUrl.searchParams;
  const events = await listAdminEvents({ q: params.get("q") ?? undefined, status: params.get("status") ?? undefined });
  return NextResponse.json({ events });
});

export const POST = adminRoute(eventInput, async ({ admin, body }) =>
  NextResponse.json({ event: await createEvent(admin.id, body) }, { status: 201 }),
);
