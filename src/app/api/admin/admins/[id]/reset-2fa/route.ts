import { NextResponse } from "next/server";
import { listAdmins, resetAdmin2fa } from "@/lib/admin/admin-accounts";
import { adminRoute, numericParam } from "@/lib/admin-route";

export const POST = adminRoute(null, async ({ admin, params }) => {
  await resetAdmin2fa(admin.id, numericParam(params, "id"));
  return NextResponse.json({ admins: await listAdmins() });
});
