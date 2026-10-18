import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/admin-route";
import { createFaq, listFaqs } from "@/lib/content/faq-service";
import { faqInput } from "@/lib/validation/settings";

export const GET = adminRoute(null, async () => NextResponse.json({ faqs: await listFaqs() }));

export const POST = adminRoute(faqInput, async ({ admin, body }) => NextResponse.json({ faq: await createFaq(admin.id, body) }, { status: 201 }));
