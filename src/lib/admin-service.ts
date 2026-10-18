import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, readSession } from "@/lib/admin-session";
import { decrypt, encrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { hashPassword } from "@/lib/password";

export type Admin = { id: number; email: string };
type AdminRow = Admin & { password_hash: string; totp_secret_enc: Buffer | null; is_active: boolean };

export const MIN_PASSWORD_LENGTH = 10;

export async function createAdmin(email: string, password: string): Promise<number> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Kata sandi minimal ${MIN_PASSWORD_LENGTH} karakter.`);
  }
  const [row] = await sql<{ id: number }[]>`
    insert into admins (email, password_hash) values (${email.trim().toLowerCase()}, ${await hashPassword(password)})
    returning id`;
  return row.id;
}

export async function findAdminByEmail(email: string): Promise<AdminRow | null> {
  const [row] = await sql<AdminRow[]>`
    select id, email, password_hash, totp_secret_enc, is_active from admins where email = ${email.trim().toLowerCase()}`;
  return row ?? null;
}

export async function getActiveAdmin(id: number): Promise<Admin | null> {
  const [row] = await sql<Admin[]>`select id, email from admins where id = ${id} and is_active`;
  return row ?? null;
}

export async function setTotpSecret(adminId: number, secret: string | null): Promise<void> {
  const enc = secret === null ? null : encrypt(secret);
  await sql`update admins set totp_secret_enc = ${enc} where id = ${adminId}`;
}

export async function getTotpSecret(adminId: number): Promise<string | null> {
  const [row] = await sql<{ totp_secret_enc: Buffer | null }[]>`
    select totp_secret_enc from admins where id = ${adminId}`;
  return row?.totp_secret_enc ? decrypt(Buffer.from(row.totp_secret_enc)) : null;
}

export async function markLoggedIn(adminId: number): Promise<void> {
  await sql`update admins set last_login_at = now() where id = ${adminId}`;
}

export async function adminFromCookie(value: string | undefined): Promise<Admin | null> {
  const session = readSession(value);
  if (!session) return null;
  const [row] = await sql<Admin[]>`
    select id, email from admins
     where id = ${session.id} and is_active and (sessions_valid_after is null or sessions_valid_after <= ${session.issuedAt})`;
  return row ?? null;
}

/** Ends every session of an admin issued before now; pass the time from Node so a cookie issued right after stays valid. */
export async function revokeSessions(adminId: number, before: Date = new Date()): Promise<void> {
  await sql`update admins set sessions_valid_after = ${before} where id = ${adminId}`;
}

export function requireAdmin(req: NextRequest): Promise<Admin | null> {
  return adminFromCookie(req.cookies.get(ADMIN_COOKIE)?.value);
}
