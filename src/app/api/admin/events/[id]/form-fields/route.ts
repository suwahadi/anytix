import { NextResponse } from "next/server";
import { adminRoute, numericParam } from "@/lib/admin-route";
import { createFormField, listFormFields } from "@/lib/catalog/form-field-service";
import { formFieldInput } from "@/lib/validation/catalog";

export const GET = adminRoute(null, async ({ params }) =>
  NextResponse.json({ fields: await listFormFields(numericParam(params, "id")) }),
);

export const POST = adminRoute(formFieldInput, async ({ admin, body, params }) =>
  NextResponse.json({ field: await createFormField(admin.id, numericParam(params, "id"), body) }, { status: 201 }),
);
