import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminAccount, listAdmins } from "@/lib/admin/admin-accounts";
import { adminRoute } from "@/lib/admin-route";

const createInput = z.object({
  email: z.string().trim().max(254).email("Email tidak valid."),
  password: z.string().max(200),
});

export const GET = adminRoute(null, async ({ admin }) => NextResponse.json({ admins: await listAdmins(), meId: admin.id }));

export const POST = adminRoute(createInput, async ({ admin, body }) => {
  await createAdminAccount(admin.id, body);
  return NextResponse.json({ admins: await listAdmins() }, { status: 201 });
});
