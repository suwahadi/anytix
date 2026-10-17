import { NextResponse } from "next/server";
import { adminRoute, numericParam } from "@/lib/admin-route";
import { createVoucher, listVouchers } from "@/lib/catalog/voucher-service";
import { voucherInput } from "@/lib/validation/catalog";

export const GET = adminRoute(null, async ({ params, req }) =>
  NextResponse.json({ vouchers: await listVouchers(numericParam(params, "id"), req.nextUrl.searchParams.get("q") ?? undefined) }),
);

export const POST = adminRoute(voucherInput, async ({ admin, body, params }) =>
  NextResponse.json({ voucher: await createVoucher(admin.id, numericParam(params, "id"), body) }, { status: 201 }),
);
