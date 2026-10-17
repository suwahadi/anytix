import { UserError } from "@/lib/admin-route";
import { createAdmin, MIN_PASSWORD_LENGTH, setTotpSecret } from "@/lib/admin-service";
import { diffFields, writeAudit } from "@/lib/audit";
import { sql } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db-errors";
import { hashPassword, verifyPassword } from "@/lib/password";

export type AdminAccount = { id: number; email: string; isActive: boolean; has2fa: boolean; lastLoginAt: Date | null; createdAt: Date };

const DUPLICATE = "Email sudah dipakai admin lain.";

function duplicate(e: unknown): never {
  if (isUniqueViolation(e)) throw new UserError("Periksa kembali isian yang ditandai.", 409, { email: DUPLICATE });
  throw e;
}

export function listAdmins(): Promise<AdminAccount[]> {
  return sql<AdminAccount[]>`
    select id, email, is_active as "isActive", totp_secret_enc is not null as "has2fa", last_login_at as "lastLoginAt", created_at as "createdAt"
      from admins order by is_active desc, email`;
}

async function getAccount(id: number): Promise<AdminAccount> {
  const row = (await listAdmins()).find((a) => a.id === id);
  if (!row) throw new UserError("Admin tidak ditemukan.", 404);
  return row;
}

export async function createAdminAccount(actorId: number, input: { email: string; password: string }): Promise<number> {
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new UserError("Periksa kembali isian yang ditandai.", 422, { password: `Minimal ${MIN_PASSWORD_LENGTH} karakter.` });
  }
  const id = await createAdmin(input.email, input.password).catch(duplicate);
  await writeAudit(sql, { adminId: actorId, action: "create", entity: "admin", entityId: id, diff: { email: input.email.trim().toLowerCase() } });
  return id;
}

export async function updateAdmin(actorId: number, id: number, input: { email?: string; isActive?: boolean }): Promise<AdminAccount> {
  const before = await getAccount(id);
  if (input.isActive === false && id === actorId) throw new UserError("Anda tidak bisa menonaktifkan akun sendiri.", 409);
  const after = { email: input.email?.trim().toLowerCase() ?? before.email, isActive: input.isActive ?? before.isActive };
  const rows = await sql`
    update admins set email = ${after.email}, is_active = ${after.isActive}
     where id = ${id}
       and (${after.isActive} or exists (select 1 from admins x where x.is_active and x.id <> ${id}))
    returning id`.catch(duplicate);
  if (rows.length === 0) throw new UserError("Minimal harus ada satu admin aktif.", 409);
  await writeAudit(sql, {
    adminId: actorId,
    action: "update",
    entity: "admin",
    entityId: id,
    diff: diffFields({ email: before.email, isActive: before.isActive }, after),
  });
  return getAccount(id);
}

export async function resetAdmin2fa(actorId: number, id: number): Promise<void> {
  if (id === actorId) throw new UserError("Atur 2FA akun sendiri di halaman Keamanan.", 409);
  await getAccount(id);
  await setTotpSecret(id, null);
  await writeAudit(sql, { adminId: actorId, action: "reset_2fa", entity: "admin", entityId: id });
}

export async function changeOwnPassword(adminId: number, input: { current: string; next: string }): Promise<void> {
  const [row] = await sql<{ password_hash: string }[]>`select password_hash from admins where id = ${adminId}`;
  if (!row || !(await verifyPassword(input.current, row.password_hash))) {
    throw new UserError("Periksa kembali isian yang ditandai.", 422, { current: "Kata sandi saat ini salah." });
  }
  if (input.next.length < MIN_PASSWORD_LENGTH) {
    throw new UserError("Periksa kembali isian yang ditandai.", 422, { next: `Minimal ${MIN_PASSWORD_LENGTH} karakter.` });
  }
  await sql`update admins set password_hash = ${await hashPassword(input.next)} where id = ${adminId}`;
  await writeAudit(sql, { adminId, action: "change_password", entity: "admin", entityId: adminId });
}
