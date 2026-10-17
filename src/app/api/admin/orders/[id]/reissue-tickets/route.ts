import { NextResponse } from "next/server";
import { getAdminOrder, reissueTickets } from "@/lib/admin/order-admin-service";
import { adminRoute, numericParam } from "@/lib/admin-route";

export const POST = adminRoute(null, async ({ admin, params }) => {
  const id = numericParam(params, "id");
  const reissued = await reissueTickets(admin.id, id);
  return NextResponse.json({ order: await getAdminOrder(id), reissued });
});
