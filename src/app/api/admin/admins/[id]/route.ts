import { NextResponse } from "next/server";
import { z } from "zod";
import { listAdmins, updateAdmin } from "@/lib/admin/admin-accounts";
import { adminRoute, numericParam } from "@/lib/admin-route";

const updateInput = z.object({
  email: z.string().trim().max(254).email("Email tidak valid.").optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = adminRoute(updateInput, async ({ admin, body, params }) => {
  await updateAdmin(admin.id, numericParam(params, "id"), body);
  return NextResponse.json({ admins: await listAdmins() });
});
