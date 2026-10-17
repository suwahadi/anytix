import { NextResponse } from "next/server";
import { adminRoute, numericParam } from "@/lib/admin-route";
import { reorderFormFields } from "@/lib/catalog/form-field-service";
import { reorderInput } from "@/lib/validation/catalog";

export const PUT = adminRoute(reorderInput, async ({ admin, body, params }) => {
  await reorderFormFields(admin.id, numericParam(params, "id"), body.ids);
  return NextResponse.json({ ok: true });
});
