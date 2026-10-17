import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { resolvePublicSlug } from "@/lib/public/catalog-queries";
import { ticketBadge, type TicketBadge } from "@/lib/ticket-status";

type Availability = { categories: Array<{ id: number; inventoryId: number; badge: TicketBadge }> };

// shortcut: memo is per server instance, so instances can disagree for up to 3 s; move to a shared cache if that matters.
const memo = new Map<number, { at: number; body: Availability }>();
const MEMO_MS = 3000;

async function loadAvailability(eventId: number): Promise<Availability> {
  const rows = await sql<
    { id: number; inventoryId: number; status: string; capacity: number; sold: number; held: number; saleStartsAt: Date; saleEndsAt: Date; eventSaleStatus: string }[]
  >`
    select tc.id, i.id as "inventoryId", tc.status, i.capacity, i.sold, i.held,
           tc.sale_starts_at as "saleStartsAt", tc.sale_ends_at as "saleEndsAt", e.sale_status as "eventSaleStatus"
      from ticket_categories tc
      join ticket_inventory i on i.ticket_category_id = tc.id
      join events e on e.id = tc.event_id
     where tc.event_id = ${eventId} and tc.status = 'active'
     order by tc.position, tc.id`;
  const now = new Date();
  return { categories: rows.map((r) => ({ id: r.id, inventoryId: r.inventoryId, badge: ticketBadge(r, now) })) };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const resolved = await resolvePublicSlug((await params).slug);
  if (!resolved) return NextResponse.json({ error: "Event tidak ditemukan." }, { status: 404 });

  let entry = memo.get(resolved.eventId);
  if (!entry || Date.now() - entry.at > MEMO_MS) {
    entry = { at: Date.now(), body: await loadAvailability(resolved.eventId) };
    memo.set(resolved.eventId, entry);
  }
  return NextResponse.json(entry.body, { headers: { "cache-control": "public, s-maxage=3, stale-while-revalidate=2" } });
}
