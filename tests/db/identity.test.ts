import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { revealIdentity } from "@/lib/admin/identity-service";
import { UserError } from "@/lib/admin-route";
import { createAdmin } from "@/lib/admin-service";
import { encrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { checkoutTestOrder, cleanupTestEvents, createTestEvent } from "./helpers";

let adminId = 0;

beforeAll(async () => {
  adminId = await createAdmin(`test-admin-${randomUUID().slice(0, 8)}@example.com`, "rahasia-panjang-123");
});

afterAll(async () => {
  await cleanupTestEvents();
  await sql`delete from audit_logs where admin_id = ${adminId}`;
  await sql`delete from admins where id = ${adminId}`;
});

async function orderWithIdentity(endedDaysAgo: number | null = null) {
  const ev = await createTestEvent();
  const o = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }] });
  if (endedDaysAgo !== null) {
    await sql`update events set starts_at = now() - make_interval(days => ${endedDaysAgo + 1}),
                               ends_at = now() - make_interval(days => ${endedDaysAgo}) where id = ${ev.eventId}`;
  }
  const [field] = await sql<{ id: number }[]>`
    insert into form_fields (event_id, key, label, type, required, position) values (${ev.eventId}, 'identitas', 'Identitas', 'identity', true, 1) returning id`;
  await sql`insert into order_answers (order_id, form_field_id, value, value_encrypted)
            values (${o.orderId}, ${field.id}, ${sql.json({ type: "KTP" })}, ${encrypt("3201234567890001")})`;
  return o;
}

async function encryptedOf(orderId: number) {
  const [row] = await sql<{ value_encrypted: Buffer | null; value: unknown }[]>`select value_encrypted, value from order_answers where order_id = ${orderId}`;
  return row;
}

async function failure(p: Promise<unknown>): Promise<UserError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof UserError) return e;
    throw e;
  }
  throw new Error("expected UserError");
}

describe("identity controls", () => {
  it("reveal returns full number and audits without it", async () => {
    const o = await orderWithIdentity();
    expect(await revealIdentity(adminId, o.orderId)).toEqual([{ label: "Identitas", type: "KTP", number: "3201234567890001" }]);
    const [audit] = await sql<{ diff: unknown }[]>`
      select diff from audit_logs where admin_id = ${adminId} and action = 'reveal_identity' and entity = 'order' and entity_id = ${String(o.orderId)}`;
    expect(audit.diff).toEqual({ fields: ["Identitas"] });
    expect(JSON.stringify(audit.diff)).not.toContain("3201234567890001");
  });

  it("purge removes numbers 60 days after the event", async () => {
    const o = await orderWithIdentity(61);
    await sql`select purge_identity_numbers()`;
    const row = await encryptedOf(o.orderId);
    expect(row.value_encrypted).toBeNull();
    expect(row.value).toEqual({ type: "KTP" });
  });

  it("purge keeps numbers of recent events", async () => {
    const o = await orderWithIdentity(59);
    await sql`select purge_identity_numbers()`;
    expect((await encryptedOf(o.orderId)).value_encrypted).not.toBeNull();
  });

  it("reveal after purge is 410", async () => {
    const o = await orderWithIdentity(61);
    await sql`select purge_identity_numbers()`;
    const e = await failure(revealIdentity(adminId, o.orderId));
    expect(e.status).toBe(410);
    expect(e.message).toBe("Nomor identitas sudah dihapus sesuai masa simpan.");
  });

  it("reveal of an order without identity is 404", async () => {
    const ev = await createTestEvent();
    const o = await checkoutTestOrder({ eventId: ev.eventId, items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }] });
    expect((await failure(revealIdentity(adminId, o.orderId))).status).toBe(404);
  });

  it("cron job is scheduled", async () => {
    const [job] = await sql<{ schedule: string; command: string }[]>`select schedule, command from cron.job where jobname = 'purge-identity-numbers'`;
    expect(job).toEqual({ schedule: "30 19 * * *", command: "select public.purge_identity_numbers()" });
  });
});
