import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/admin-route";
import { reorderFaqs } from "@/lib/content/faq-service";
import { reorderInput } from "@/lib/validation/catalog";

export const PUT = adminRoute(reorderInput, async ({ admin, body }) => {
  await reorderFaqs(admin.id, body.ids);
  return NextResponse.json({ ok: true });
});
