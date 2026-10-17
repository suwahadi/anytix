import { adminRoute } from "@/lib/admin-route";
import { ordersCsv } from "@/lib/admin/sales-report";

export const GET = adminRoute(null, async ({ admin, req }) => {
  const p = req.nextUrl.searchParams;
  const eventId = Number(p.get("eventId"));
  const { filename, body } = await ordersCsv(admin.id, {
    eventId: Number.isInteger(eventId) && eventId > 0 ? eventId : undefined,
    status: p.get("status") || undefined,
  });
  return new Response(body, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"` },
  });
});
