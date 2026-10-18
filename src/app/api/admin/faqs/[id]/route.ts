import { NextResponse } from "next/server";
import { adminRoute, numericParam } from "@/lib/admin-route";
import { removeFaq, updateFaq } from "@/lib/content/faq-service";
import { faqInput } from "@/lib/validation/settings";

export const PATCH = adminRoute(faqInput, async ({ admin, body, params }) =>
  NextResponse.json({ faq: await updateFaq(admin.id, numericParam(params, "id"), body) }),
);

export const DELETE = adminRoute(null, async ({ admin, params }) => {
  await removeFaq(admin.id, numericParam(params, "id"));
  return NextResponse.json({ ok: true });
});
