import { readdirSync } from "node:fs";
import { join } from "node:path";
import { sql } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { runPreflight } from "@/lib/preflight";
import { getSettingsGroup } from "@/lib/settings-service";

async function main() {
  const env = getEnv();
  const [admins, applied, cron, [{ n: testEventCount }], site, smtp, transaction] = await Promise.all([
    sql<{ email: string; active: boolean; has2fa: boolean }[]>`
      select email, is_active as active, totp_secret_enc is not null as "has2fa" from admins order by email`,
    sql<{ filename: string }[]>`select filename from schema_migrations`,
    sql<{ jobname: string }[]>`select jobname from cron.job`,
    sql<{ n: number }[]>`select count(*)::int as n from events where slug like 'test-%'`,
    getSettingsGroup("site"),
    getSettingsGroup("smtp"),
    getSettingsGroup("transaction"),
  ]);
  const methods = transaction.paymentMethods;
  const rows = runPreflight({
    env: {
      APP_URL: env.APP_URL,
      MIDTRANS_IS_PRODUCTION: env.MIDTRANS_IS_PRODUCTION,
      hasMidtransKeys: Boolean(env.MIDTRANS_SERVER_KEY && env.MIDTRANS_CLIENT_KEY),
      TURNSTILE_SITE_KEY: env.TURNSTILE_SITE_KEY,
      TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY,
      TRUST_PROXY: env.TRUST_PROXY,
      DB_TESTS_ALLOWED: process.env.DB_TESTS_ALLOWED,
    },
    admins,
    migrationFiles: readdirSync(join(process.cwd(), "db", "migrations")).filter((f) => f.endsWith(".sql")),
    appliedMigrations: applied.map((r) => r.filename),
    cronJobs: cron.map((r) => r.jobname),
    testEventCount,
    site: { ...site, csEmail: site.csEmail || undefined },
    smtp: smtp.host ? { host: smtp.host, from: smtp.from } : null,
    paymentMethodsEnabled: (methods?.qris ? 1 : 0) + Object.values(methods?.va ?? {}).filter(Boolean).length,
  });
  for (const r of rows) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.check.padEnd(16)} ${r.detail}`);
  const failed = rows.filter((r) => !r.ok).length;
  console.log(failed === 0 ? "\nSiap produksi." : `\n${failed} pemeriksaan gagal.`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
