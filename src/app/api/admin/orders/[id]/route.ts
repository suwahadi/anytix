import { NextResponse } from "next/server";
import { getAdminOrder } from "@/lib/admin/order-admin-service";
import { adminRoute, numericParam } from "@/lib/admin-route";

export const GET = adminRoute(null, async ({ params }) => NextResponse.json({ order: await getAdminOrder(numericParam(params, "id")) }));
