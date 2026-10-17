import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createRoute } from "@/app/api/admin/events/[id]/ticket-categories/route";
import { UserError } from "@/lib/admin-route";
import { ADMIN_COOKIE, createSessionValue } from "@/lib/admin-session";
import { createAdmin } from "@/lib/admin-service";
import {
  createTicketCategory,
  listTicketCategories,
  removeTicketCategory,
  reorderTicketCategories,
  updateTicketCategory,
} from "@/lib/catalog/ticket-category-service";
import { sql } from "@/lib/db";
import { releaseHold, reserveTickets } from "@/lib/hold-service";
import { ticketCategoryInput } from "@/lib/validation/catalog";
import { cleanupTestEvents, createTestEvent, inventoryRow } from "./helpers";

let adminId = 0;

beforeAll(async () => {
  adminId = await createAdmin(`test-admin-${randomUUID().slice(0, 8)}@example.com`, "rahasia-panjang-123");
});

afterAll(async () => {
  await cleanupTestEvents();
  await sql`delete from audit_logs where admin_id = ${adminId}`;
  await sql`delete from admins where email like 'test-admin-%'`;
});

function values(over: Record<string, unknown> = {}) {
  return ticketCategoryInput.parse({
    name: "Reguler",
    price: 100000,
    capacity: 10,
    saleStartsAt: new Date(Date.now() - 3_600_000).toISOString(),
    saleEndsAt: new Date(Date.now() + 86_400_000).toISOString(),
    status: "active",
    ...over,
  });
}

async function userError(p: Promise<unknown>): Promise<UserError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof UserError) return e;
    throw e;
  }
  throw new Error("expected UserError");
}

const reserve = (eventId: number, inventoryId: number, qty: number) =>
  reserveTickets({ visitorId: randomUUID(), eventId, items: [{ inventoryId, qty }], idempotencyKey: randomUUID() });

describe("ticket categories", () => {
  it("create adds inventory on the default session", async () => {
    const ev = await createTestEvent({ categories: [] });
    const cat = await createTicketCategory(adminId, ev.eventId, values({ name: "VIP", capacity: 25 }));
    expect(cat).toMatchObject({ name: "VIP", capacity: 25, sold: 0, held: 0, available: 25, everReserved: false });
    const [inv] = await sql`select session_id from ticket_inventory where id = ${cat.inventoryId}`;
    expect(inv.session_id).toBe(ev.sessionId);
    await reserve(ev.eventId, cat.inventoryId, 2);
    expect(await inventoryRow(cat.inventoryId)).toMatchObject({ held: 2 });
    const tags = (globalThis as { __revalidatedTags?: string[] }).__revalidatedTags ?? [];
    expect(tags).toEqual(expect.arrayContaining(["events", `event-${ev.eventId}`]));
  });

  it("capacity below sold plus held is rejected with a message", async () => {
    const ev = await createTestEvent({ categories: [] });
    const cat = await createTicketCategory(adminId, ev.eventId, values({ capacity: 10 }));
    await reserve(ev.eventId, cat.inventoryId, 3);
    const err = await userError(updateTicketCategory(adminId, ev.eventId, cat.id, values({ capacity: 2 })));
    expect(err.status).toBe(409);
    expect(err.fields?.capacity).toContain("3");
    const ok = await updateTicketCategory(adminId, ev.eventId, cat.id, values({ capacity: 3, name: "Reguler Baru" }));
    expect(ok).toMatchObject({ capacity: 3, held: 3, available: 0, name: "Reguler Baru" });
  });

  it("refuses delete when used", async () => {
    const ev = await createTestEvent({ categories: [] });
    const used = await createTicketCategory(adminId, ev.eventId, values());
    const visitorId = randomUUID();
    const hold = await reserveTickets({
      visitorId,
      eventId: ev.eventId,
      items: [{ inventoryId: used.inventoryId, qty: 1 }],
      idempotencyKey: randomUUID(),
    });
    await releaseHold(hold.id, visitorId);
    const err = await userError(removeTicketCategory(adminId, ev.eventId, used.id));
    expect(err.status).toBe(409);
    expect(err.message).toContain("Sembunyikan");

    const fresh = await createTicketCategory(adminId, ev.eventId, values({ name: "Belum dipesan" }));
    await removeTicketCategory(adminId, ev.eventId, fresh.id);
    expect(await sql`select 1 from ticket_inventory where id = ${fresh.inventoryId}`).toHaveLength(0);
    expect((await listTicketCategories(ev.eventId)).map((c) => c.id)).toEqual([used.id]);
  });

  it("reorder sets positions in given order", async () => {
    const ev = await createTestEvent({ categories: [] });
    const a = await createTicketCategory(adminId, ev.eventId, values({ name: "Kat A" }));
    const b = await createTicketCategory(adminId, ev.eventId, values({ name: "Kat B" }));
    await reorderTicketCategories(adminId, ev.eventId, [b.id, a.id]);
    expect((await listTicketCategories(ev.eventId)).map((c) => c.name)).toEqual(["Kat B", "Kat A"]);
    expect((await userError(reorderTicketCategories(adminId, ev.eventId, [a.id]))).status).toBe(422);
  });

  it("other event's category is 404", async () => {
    const one = await createTestEvent({ categories: [] });
    const two = await createTestEvent({ categories: [] });
    const cat = await createTicketCategory(adminId, one.eventId, values());
    expect((await userError(updateTicketCategory(adminId, two.eventId, cat.id, values()))).status).toBe(404);
    expect((await userError(removeTicketCategory(adminId, two.eventId, cat.id))).status).toBe(404);
  });

  it("rejects price below 1000", async () => {
    const ev = await createTestEvent({ categories: [] });
    const res = await createRoute(
      new NextRequest(`http://localhost/api/admin/events/${ev.eventId}/ticket-categories`, {
        method: "POST",
        body: JSON.stringify({ ...values(), price: 500 }),
        headers: { "content-type": "application/json", cookie: `${ADMIN_COOKIE}=${createSessionValue(adminId)}` },
      }),
      { params: Promise.resolve({ id: String(ev.eventId) }) },
    );
    expect(res.status).toBe(422);
    expect((await res.json()).fields.price).toBeDefined();
  });
});
