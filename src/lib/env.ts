import { z } from "zod";

const optional = z.string().trim().min(1).optional().catch(undefined);

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  COOKIE_SECRET: z.string().min(32),
  DATA_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "must be base64 of exactly 32 bytes"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SUPABASE_URL: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  NEXT_PUBLIC_MEDIA_BASE_URL: optional,
  MIDTRANS_SERVER_KEY: optional,
  MIDTRANS_CLIENT_KEY: optional,
  MIDTRANS_IS_PRODUCTION: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  MIDTRANS_NOTIFICATION_URL: optional,
  TURNSTILE_SITE_KEY: z.string().default("1x00000000000000000000AA"),
  TURNSTILE_SECRET_KEY: z.string().default("1x0000000000000000000000000000000AA"),
  SMTP_HOST: optional,
  SMTP_PORT: optional,
  SMTP_USER: optional,
  SMTP_PASS: optional,
  SMTP_FROM: optional,
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Returns an optional env value, throwing a readable error where a feature needs it. */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = getEnv()[key];
  if (value === undefined || value === null) throw new Error(`Missing environment variable ${String(key)}`);
  return value as NonNullable<Env[K]>;
}
