import { decrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { maskIdentity } from "@/lib/mask";

export type CheckInResult =
  | { result: "valid"; buyerName: string; category: string; seq: number; total: number; identity: string | null }
  | { result: "used"; checkedInAt: string; gate: string | null }
  | { result: "wrong_event"; eventTitle: string }
  | { result: "invalid" };

type Raw = {
  result: CheckInResult["result"];
  order_id?: number;
  seq?: number;
  total?: number;
  category?: string;
  buyer_name?: string;
  checked_in_at?: string;
  gate?: string | null;
  event_title?: string;
};

async function maskedIdentity(orderId: number): Promise<string | null> {
  const [row] = await sql<{ value: { type?: string } | null; value_encrypted: Buffer | null }[]>`
    select a.value, a.value_encrypted from order_answers a join form_fields f on f.id = a.form_field_id
     where a.order_id = ${orderId} and f.type = 'identity' and a.value_encrypted is not null
     order by f.position, f.id limit 1`;
  if (!row?.value_encrypted) return null;
  return [row.value?.type, maskIdentity(decrypt(Buffer.from(row.value_encrypted)))].filter(Boolean).join(" ");
}

/** Validates one scanned QR for an event; spaces are dropped so a token typed in groups still matches. */
export async function checkIn(adminId: number, input: { token: string; eventId: number; gate: string }): Promise<CheckInResult> {
  const token = input.token.replace(/\s+/g, "");
  const [{ r }] = await sql<{ r: Raw }[]>`select check_in_ticket(${token}, ${input.eventId}, ${adminId}, ${input.gate}) as r`;
  switch (r.result) {
    case "valid":
      return {
        result: "valid",
        buyerName: r.buyer_name ?? "",
        category: r.category ?? "",
        seq: Number(r.seq),
        total: Number(r.total),
        identity: await maskedIdentity(Number(r.order_id)),
      };
    case "used":
      return { result: "used", checkedInAt: new Date(r.checked_in_at ?? Date.now()).toISOString(), gate: r.gate ?? null };
    case "wrong_event":
      return { result: "wrong_event", eventTitle: r.event_title ?? "" };
    default:
      return { result: "invalid" };
  }
}

export async function checkinStats(eventId: number): Promise<Array<{ category: string; issued: number; checkedIn: number }>> {
  return sql<{ category: string; issued: number; checkedIn: number }[]>`
    select c.name as category, count(t.id)::int as issued, count(t.checked_in_at)::int as "checkedIn"
      from ticket_categories c
      left join tickets t on t.ticket_category_id = c.id and t.status = 'valid'
                         and exists (select 1 from orders o where o.id = t.order_id and o.status = 'paid')
     where c.event_id = ${eventId}
     group by c.id, c.name, c.position
     order by c.position, c.id`;
}

export const CHECKIN_PAGE_SIZE = 50;

export type CheckinHistoryItem = {
  at: Date;
  result: string;
  gate: string | null;
  adminEmail: string | null;
  seq: number | null;
  category: string | null;
  buyerName: string | null;
};

export async function checkinHistory(eventId: number, f: { result?: string; page: number }): Promise<{ items: CheckinHistoryItem[]; total: number }> {
  const result = f.result || null;
  const page = Math.min(Math.max(1, Math.floor(f.page) || 1), 10_000);
  const where = sql`ce.event_id = ${eventId} and (${result}::text is null or ce.result = ${result})`;
  const [items, [{ total }]] = await Promise.all([
    sql<CheckinHistoryItem[]>`
      select ce.created_at as at, ce.result, ce.gate, a.email as "adminEmail", t.seq, c.name as category, o.buyer_name as "buyerName"
        from checkin_events ce
        left join admins a on a.id = ce.admin_id
        left join tickets t on t.id = ce.ticket_id
        left join ticket_categories c on c.id = t.ticket_category_id
        left join orders o on o.id = t.order_id
       where ${where}
       order by ce.id desc
       limit ${CHECKIN_PAGE_SIZE} offset ${(page - 1) * CHECKIN_PAGE_SIZE}`,
    sql<{ total: number }[]>`select count(*)::int as total from checkin_events ce where ${where}`,
  ]);
  return { items, total };
}
