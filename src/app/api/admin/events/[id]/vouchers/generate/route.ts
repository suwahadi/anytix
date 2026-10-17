import { NextResponse } from "next/server";
import { adminRoute, numericParam } from "@/lib/admin-route";
import { generateVouchers } from "@/lib/catalog/voucher-service";
import { voucherGenerateInput } from "@/lib/validation/catalog";

export const POST = adminRoute(voucherGenerateInput, async ({ admin, body, params }) =>
  NextResponse.json({ codes: await generateVouchers(admin.id, numericParam(params, "id"), body) }, { status: 201 }),
);
