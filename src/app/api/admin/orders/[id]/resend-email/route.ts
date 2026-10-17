import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminOrder, resendOrderEmail } from "@/lib/admin/order-admin-service";
import { adminRoute, numericParam } from "@/lib/admin-route";

const resendInput = z.object({
  to: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().email("Email tidak valid.").optional()),
  updateBuyerEmail: z.boolean().default(false),
});

export const POST = adminRoute(resendInput, async ({ admin, params, body }) => {
  const id = numericParam(params, "id");
  await resendOrderEmail(admin.id, id, body);
  return NextResponse.json({ order: await getAdminOrder(id) });
});
