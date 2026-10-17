import { NextResponse } from "next/server";
import { cancelOrder, getAdminOrder } from "@/lib/admin/order-admin-service";
import { adminRoute, numericParam } from "@/lib/admin-route";

export const POST = adminRoute(null, async ({ admin, params }) => {
  const id = numericParam(params, "id");
  await cancelOrder(admin.id, id);
  return NextResponse.json({ order: await getAdminOrder(id) });
});
