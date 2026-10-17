import { afterAll, describe, expect, it } from "vitest";
import { sql } from "@/lib/db";
import { cleanupTestEvents, createTestEvent } from "./helpers";

const prdTables = [
  "event_categories", "events", "slug_redirects", "event_sessions", "ticket_categories", "ticket_inventory",
  "form_fields", "holds", "hold_items", "orders", "order_answers", "consents", "payments", "payment_events",
  "vouchers", "tickets", "checkin_events", "jobs", "admins", "settings", "email_logs", "audit_logs",
];

afterAll(async () => {
  await cleanupTestEvents();
});

describe("schema", () => {
  it("all tables exist", async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`;
    const names = rows.map((r) => r.table_name);
    for (const t of [...prdTables, "schema_migrations"]) expect(names).toContain(t);
  });

  it("rls enabled on every public table", async () => {
    const rows = await sql`
      select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where nspname = 'public' and relkind = 'r' and not relrowsecurity`;
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("anon has no table access", async () => {
    const [row] = await sql`select has_table_privilege('anon', 'public.orders', 'select') as allowed`;
    expect(row.allowed).toBe(false);
  });

  it("settings defaults seeded", async () => {
    const rows = await sql<{ key: string; value: unknown }[]>`select key, value from settings`;
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(map.hold_minutes).toBe(3);
    expect(map.pay_minutes).toBe(15);
    expect(map.pay_grace_minutes).toBe(5);
    expect(map.service_fee).toBe(5000);
    expect(map.payment_methods).toMatchObject({ qris: true, va: { bca: true } });
  });

  it("event categories seeded", async () => {
    const rows = await sql<{ slug: string }[]>`select slug from event_categories order by position`;
    expect(rows.map((r) => r.slug)).toEqual([
      "music", "exhibition", "theater", "sports", "tourism", "talkshow", "workshop", "competition",
    ]);
  });

  it("inventory check blocks sold+held over capacity", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 1 }] });
    await expect(sql`update ticket_inventory set held = 2 where id = ${ev.inventoryIds[0]}`).rejects.toMatchObject({
      code: "23514",
    });
  });

  it("media bucket is public", async () => {
    const [row] = await sql`select public from storage.buckets where id = 'media'`;
    expect(row?.public).toBe(true);
  });
});
