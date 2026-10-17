import { NextResponse } from "next/server";
import { adminRoute, numericParam } from "@/lib/admin-route";
import { removeFormField, updateFormField } from "@/lib/catalog/form-field-service";
import { formFieldInput } from "@/lib/validation/catalog";

export const PATCH = adminRoute(formFieldInput, async ({ admin, body, params }) =>
  NextResponse.json({
    field: await updateFormField(admin.id, numericParam(params, "id"), numericParam(params, "fieldId"), body),
  }),
);

export const DELETE = adminRoute(null, async ({ admin, params }) => {
  await removeFormField(admin.id, numericParam(params, "id"), numericParam(params, "fieldId"));
  return NextResponse.json({ ok: true });
});
