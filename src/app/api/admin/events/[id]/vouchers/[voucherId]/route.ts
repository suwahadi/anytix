import { NextResponse } from "next/server";
import { adminRoute, numericParam } from "@/lib/admin-route";
import { deleteVoucher, updateVoucher } from "@/lib/catalog/voucher-service";
import { voucherInput } from "@/lib/validation/catalog";

export const PATCH = adminRoute(voucherInput, async ({ admin, body, params }) =>
  NextResponse.json({ voucher: await updateVoucher(admin.id, numericParam(params, "id"), numericParam(params, "voucherId"), body) }),
);

export const DELETE = adminRoute(null, async ({ admin, params }) => {
  await deleteVoucher(admin.id, numericParam(params, "id"), numericParam(params, "voucherId"));
  return NextResponse.json({ ok: true });
});
