import { sql } from "@/lib/db";
import { isUniqueViolation, parseEngineError } from "@/lib/db-errors";

export class HoldError extends Error {
  inventoryId?: number;
  available?: number;
  max?: number;

  constructor(
    public code: string,
    details: { inventoryId?: number; available?: number; max?: number } = {},
  ) {
    super(code);
    Object.assign(this, details);
  }
}

export type Hold = { id: string; status: string; expiresAt: Date };

type ReserveInput = {
  visitorId: string;
  eventId: number;
  items: Array<{ inventoryId: number; qty: number }>;
  idempotencyKey: string;
};

function toHoldError(code: string, args: string[]): HoldError {
  const [inv, n] = args.map(Number);
  if (code === "SOLD_OUT") return new HoldError(code, { inventoryId: inv, available: n });
  if (code === "MAX_PER_ORDER") return new HoldError(code, { inventoryId: inv, max: n });
  if (code === "CATEGORY_NOT_ON_SALE") return new HoldError(code, { inventoryId: inv });
  return new HoldError(code);
}

export async function reserveTickets(input: ReserveInput): Promise<Hold> {
  const items = input.items.map((i) => ({ inventory_id: i.inventoryId, qty: i.qty }));
  try {
    const [row] = await sql<{ id: string; status: string; expires_at: Date }[]>`
      select id, status, expires_at
        from reserve_tickets(${input.visitorId}::uuid, ${input.eventId}, ${sql.json(items)}, ${input.idempotencyKey})`;
    return { id: row.id, status: row.status, expiresAt: row.expires_at };
  } catch (e) {
    const engine = parseEngineError(e);
    if (engine) throw toHoldError(engine.code, engine.args);
    if (!isUniqueViolation(e)) throw e;
    const [row] = await sql<{ id: string; status: string; expires_at: Date }[]>`
      select id, status, expires_at from holds
       where visitor_id = ${input.visitorId} and idempotency_key = ${input.idempotencyKey}`;
    if (row) return { id: row.id, status: row.status, expiresAt: row.expires_at };
    throw new HoldError("CONCURRENT");
  }
}

export async function releaseHold(holdId: string, visitorId: string): Promise<boolean> {
  const [row] = await sql<{ released: boolean }[]>`
    select release_hold(${holdId}::uuid, ${visitorId}::uuid) as released`;
  return row.released;
}
