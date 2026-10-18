import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changeOwnPassword, createAdminAccount, listAdmins, resetAdmin2fa, updateAdmin } from "@/lib/admin/admin-accounts";
import { listAuditLogs } from "@/lib/admin/audit-log";
import { UserError } from "@/lib/admin-route";
import { createSessionValue } from "@/lib/admin-session";
import { adminFromCookie, createAdmin, findAdminByEmail, getTotpSecret, setTotpSecret } from "@/lib/admin-service";
import { sql } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

let actorId = 0;
const email = () => `test-admin-${randomUUID().slice(0, 8)}@example.com`;

beforeAll(async () => {
  actorId = await createAdmin(email(), "rahasia-panjang-123");
});

afterAll(async () => {
  await sql`delete from audit_logs where admin_id in (select id from admins where email like 'test-admin-%')`;
  await sql`delete from admins where email like 'test-admin-%'`;
});

async function failure(p: Promise<unknown>): Promise<UserError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof UserError) return e;
    throw e;
  }
  throw new Error("expected UserError");
}

describe("admin accounts", () => {
  it("create and list admins", async () => {
    const address = email();
    const id = await createAdminAccount(actorId, { email: address.toUpperCase(), password: "kata-sandi-baru-1" });
    const row = (await listAdmins()).find((a) => a.id === id);
    expect(row).toMatchObject({ email: address, isActive: true, has2fa: false, lastLoginAt: null });
    const e = await failure(createAdminAccount(actorId, { email: address, password: "kata-sandi-baru-1" }));
    expect(e.status).toBe(409);
    expect(e.fields?.email).toBe("Email sudah dipakai admin lain.");
  });

  it("cannot deactivate self", async () => {
    const e = await failure(updateAdmin(actorId, actorId, { isActive: false }));
    expect(e.status).toBe(409);
    expect(e.message).toBe("Anda tidak bisa menonaktifkan akun sendiri.");
  });

  it("deactivated admin session is refused", async () => {
    const id = await createAdminAccount(actorId, { email: email(), password: "kata-sandi-baru-1" });
    const cookie = createSessionValue(id);
    expect(await adminFromCookie(cookie)).not.toBeNull();
    await updateAdmin(actorId, id, { isActive: false });
    expect(await adminFromCookie(cookie)).toBeNull();
  });

  it("email change is audited with before and after", async () => {
    const id = await createAdminAccount(actorId, { email: email(), password: "kata-sandi-baru-1" });
    const next = email();
    await updateAdmin(actorId, id, { email: next });
    expect((await findAdminByEmail(next))?.id).toBe(id);
    const [a] = await sql<{ diff: { email: [string, string] } }[]>`
      select diff from audit_logs where admin_id = ${actorId} and entity = 'admin' and action = 'update' and entity_id = ${String(id)}`;
    expect(a.diff.email[1]).toBe(next);
  });

  it("reset 2fa of another admin", async () => {
    const id = await createAdminAccount(actorId, { email: email(), password: "kata-sandi-baru-1" });
    await setTotpSecret(id, "JBSWY3DPEHPK3PXP");
    await resetAdmin2fa(actorId, id);
    expect(await getTotpSecret(id)).toBeNull();
    expect((await failure(resetAdmin2fa(actorId, actorId))).message).toBe("Atur 2FA akun sendiri di halaman Keamanan.");
  });

  it("change password checks the current one", async () => {
    const address = email();
    const id = await createAdminAccount(actorId, { email: address, password: "kata-sandi-lama-1" });
    const wrong = await failure(changeOwnPassword(id, { current: "salah-sekali-12", next: "kata-sandi-baru-2" }));
    expect(wrong.fields?.current).toBe("Kata sandi saat ini salah.");
    const short = await failure(changeOwnPassword(id, { current: "kata-sandi-lama-1", next: "pendek" }));
    expect(short.fields?.next).toBe("Minimal 10 karakter.");
    await changeOwnPassword(id, { current: "kata-sandi-lama-1", next: "kata-sandi-baru-2" });
    expect(await verifyPassword("kata-sandi-baru-2", (await findAdminByEmail(address))!.password_hash)).toBe(true);
  });

  it("password change ends older sessions", async () => {
    const id = await createAdminAccount(actorId, { email: email(), password: "kata-sandi-lama-1" });
    const old = createSessionValue(id, Date.now() - 60_000);
    expect(await adminFromCookie(old)).not.toBeNull();
    await changeOwnPassword(id, { current: "kata-sandi-lama-1", next: "kata-sandi-baru-2" });
    expect(await adminFromCookie(old)).toBeNull();
    expect(await adminFromCookie(createSessionValue(id))).not.toBeNull();
  });

  it("2fa reset ends that admin's sessions", async () => {
    const id = await createAdminAccount(actorId, { email: email(), password: "kata-sandi-baru-1" });
    const old = createSessionValue(id, Date.now() - 60_000);
    await setTotpSecret(id, "JBSWY3DPEHPK3PXP");
    await resetAdmin2fa(actorId, id);
    expect(await adminFromCookie(old)).toBeNull();
  });

  it("audit list filters by entity", async () => {
    await createAdminAccount(actorId, { email: email(), password: "kata-sandi-baru-1" });
    const page = await listAuditLogs({ entity: "admin", adminId: actorId, page: 1 });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((i) => i.entity === "admin" && i.adminEmail?.startsWith("test-admin-"))).toBe(true);
    expect(page.entities).toContain("admin");
    expect(JSON.stringify(page.items)).not.toContain("kata-sandi");
  });
});
