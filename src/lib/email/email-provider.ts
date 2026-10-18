import nodemailer from "nodemailer";
import { UserError } from "@/lib/admin-route";
import { decrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { getEnv, type Env } from "@/lib/env";

export type EmailMessage = { to: string; replyTo?: string; subject: string; html: string; text: string };

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ messageId: string }>;
}

export type SmtpConfig = { host: string; port: number; secure: boolean; user: string; pass: string; from: string };

type StoredSmtp = { host?: string; port?: number; user?: string; from?: string; password?: string | null };
type SmtpEnv = Partial<Pick<Env, "SMTP_HOST" | "SMTP_PORT" | "SMTP_USER" | "SMTP_PASS" | "SMTP_FROM">>;

/** Panel settings win when they carry a host and a password; otherwise the SMTP_* env values. */
export function resolveSmtpConfig(stored: StoredSmtp | null, env: SmtpEnv): SmtpConfig | null {
  if (stored?.host && stored.password) {
    const port = Number(stored.port ?? 587);
    return {
      host: stored.host,
      port,
      secure: port === 465,
      user: stored.user ?? "",
      pass: stored.password,
      from: stored.from || env.SMTP_FROM || stored.user || "",
    };
  }
  if (env.SMTP_HOST && env.SMTP_PASS) {
    const port = Number(env.SMTP_PORT ?? 587);
    return {
      host: env.SMTP_HOST,
      port,
      secure: port === 465,
      user: env.SMTP_USER ?? "",
      pass: env.SMTP_PASS,
      from: env.SMTP_FROM ?? env.SMTP_USER ?? "",
    };
  }
  return null;
}

/** Short timeouts: the worker runs jobs one at a time, so a blocked SMTP port must fail in seconds, not minutes. */
export function transportOptions(config: SmtpConfig) {
  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  };
}

export async function getEmailProvider(): Promise<EmailProvider> {
  const [row] = await sql<{ value: StoredSmtp; secret_enc: Buffer | null }[]>`
    select value, secret_enc from settings where key = 'smtp'`;
  const stored = row ? { ...row.value, password: row.secret_enc ? decrypt(Buffer.from(row.secret_enc)) : null } : null;
  const config = resolveSmtpConfig(stored, getEnv());
  if (!config) throw new UserError("SMTP belum diatur. Isi di Pengaturan > Email.", 400);
  const transport = nodemailer.createTransport(transportOptions(config));
  return {
    async send(message) {
      const info = await transport.sendMail({ from: config.from, ...message });
      return { messageId: info.messageId };
    },
  };
}
