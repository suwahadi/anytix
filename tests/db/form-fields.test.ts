import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserError } from "@/lib/admin-route";
import { createAdmin } from "@/lib/admin-service";
import {
  createFormField,
  listFormFields,
  removeFormField,
  reorderFormFields,
  updateFormField,
} from "@/lib/catalog/form-field-service";
import { sql } from "@/lib/db";
import { reserveTickets } from "@/lib/hold-service";
import { formFieldInput } from "@/lib/validation/catalog";
import { checkoutHold, cleanupTestEvents, createTestEvent } from "./helpers";

let adminId = 0;

beforeAll(async () => {
  adminId = await createAdmin(`test-admin-${randomUUID().slice(0, 8)}@example.com`, "rahasia-panjang-123");
});

afterAll(async () => {
  await cleanupTestEvents();
  await sql`delete from audit_logs where admin_id = ${adminId}`;
  await sql`delete from admins where email like 'test-admin-%'`;
});

const values = (over: Record<string, unknown> = {}) => formFieldInput.parse({ label: "Ukuran Baju", type: "short_text", ...over });

async function userError(p: Promise<unknown>): Promise<UserError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof UserError) return e;
    throw e;
  }
  throw new Error("expected UserError");
}

describe("form fields", () => {
  it("creates with a key generated from the label", async () => {
    const ev = await createTestEvent({ categories: [] });
    const a = await createFormField(adminId, ev.eventId, values());
    const b = await createFormField(adminId, ev.eventId, values());
    expect(a.key).toBe("ukuran_baju");
    expect(b.key).toBe("ukuran_baju_2");
    expect((await listFormFields(ev.eventId)).map((f) => f.position)).toEqual([1, 2]);
  });

  it("rejects a duplicate explicit key", async () => {
    const ev = await createTestEvent({ categories: [] });
    await createFormField(adminId, ev.eventId, values({ key: "jenis_kelamin", label: "Jenis Kelamin" }));
    const err = await userError(createFormField(adminId, ev.eventId, values({ key: "jenis_kelamin", label: "Gender" })));
    expect(err.status).toBe(409);
    expect(err.fields?.key).toBeDefined();
  });

  it("validates options for choice fields", () => {
    expect(formFieldInput.safeParse({ label: "Ukuran", type: "chips", options: [] }).success).toBe(false);
    expect(
      formFieldInput.safeParse({ label: "Ukuran", type: "chips", options: [{ label: "M", value: "M" }, { label: "M2", value: "M" }] }).success,
    ).toBe(false);
    expect(formFieldInput.safeParse({ label: "Kode", type: "short_text", validation: { pattern: "([" } }).success).toBe(false);
  });

  it("refuses delete and type change when used", async () => {
    const ev = await createTestEvent({ categories: [{ capacity: 5 }] });
    const field = await createFormField(adminId, ev.eventId, values({ label: "Nama Panggilan" }));
    const visitorId = randomUUID();
    const hold = await reserveTickets({
      visitorId,
      eventId: ev.eventId,
      items: [{ inventoryId: ev.inventoryIds[0], qty: 1 }],
      idempotencyKey: randomUUID(),
    });
    await checkoutHold(hold.id, visitorId, { answers: [{ form_field_id: field.id, value: "Budi" }] });

    const del = await userError(removeFormField(adminId, ev.eventId, field.id));
    expect(del.status).toBe(409);
    expect(del.message).toContain("Nonaktifkan");
    const retype = await userError(updateFormField(adminId, ev.eventId, field.id, values({ label: "Nama Panggilan", type: "number" })));
    expect(retype.status).toBe(409);
    const relabel = await updateFormField(adminId, ev.eventId, field.id, values({ label: "Nama panggilan Anda", key: field.key, isActive: false }));
    expect(relabel).toMatchObject({ label: "Nama panggilan Anda", isActive: false });

    const unused = await createFormField(adminId, ev.eventId, values({ label: "Catatan" }));
    await removeFormField(adminId, ev.eventId, unused.id);
    expect((await listFormFields(ev.eventId)).map((f) => f.id)).toEqual([field.id]);
  });

  it("reorders", async () => {
    const ev = await createTestEvent({ categories: [] });
    const a = await createFormField(adminId, ev.eventId, values({ label: "Satu" }));
    const b = await createFormField(adminId, ev.eventId, values({ label: "Dua" }));
    await reorderFormFields(adminId, ev.eventId, [b.id, a.id]);
    expect((await listFormFields(ev.eventId)).map((f) => f.label)).toEqual(["Dua", "Satu"]);
  });
});
