import { NextResponse } from "next/server";
import type { HoldError } from "@/lib/hold-service";

export function holdErrorResponse(e: HoldError, names: Map<number, string>): NextResponse {
  const name = (e.inventoryId !== undefined && names.get(e.inventoryId)) || "ini";
  const extra = { code: e.code, inventoryId: e.inventoryId };
  switch (e.code) {
    case "SOLD_OUT":
      return NextResponse.json({ error: `Kuota ${name} tidak cukup, sisa ${e.available ?? 0}`, ...extra, available: e.available ?? 0 }, { status: 409 });
    case "MAX_PER_ORDER":
      return NextResponse.json({ error: `Maksimal ${e.max} tiket ${name} per transaksi.`, ...extra, max: e.max }, { status: 422 });
    case "CATEGORY_NOT_ON_SALE":
      return NextResponse.json({ error: `Tiket ${name} sedang tidak dijual.`, ...extra }, { status: 409 });
    case "NOT_ON_SALE":
      return NextResponse.json({ error: "Penjualan tiket event ini sedang ditutup.", code: e.code }, { status: 409 });
    case "INVALID_ITEMS":
      return NextResponse.json({ error: "Pilihan tiket tidak valid. Muat ulang halaman.", code: e.code }, { status: 422 });
    default:
      return NextResponse.json({ error: "Ada permintaan lain yang sedang diproses. Coba lagi.", code: e.code }, { status: 409 });
  }
}
