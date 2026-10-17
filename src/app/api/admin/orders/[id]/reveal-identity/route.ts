import { NextResponse } from "next/server";
import { revealIdentity } from "@/lib/admin/identity-service";
import { adminRoute, numericParam } from "@/lib/admin-route";
import { rateLimit } from "@/lib/rate-limit";

export const POST = adminRoute(null, async ({ admin, params }) => {
  if (!rateLimit(`reveal-identity:${admin.id}`, 10, 60_000)) {
    return NextResponse.json({ error: "Terlalu banyak permintaan. Coba lagi sebentar lagi." }, { status: 429 });
  }
  return NextResponse.json({ identities: await revealIdentity(admin.id, numericParam(params, "id")) });
});
