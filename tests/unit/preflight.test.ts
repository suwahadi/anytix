import { describe, expect, it } from "vitest";
import { runPreflight, type PreflightSnapshot } from "@/lib/preflight";

const clean: PreflightSnapshot = {
  env: {
    APP_URL: "https://anytix.web.id",
    MIDTRANS_IS_PRODUCTION: true,
    hasMidtransKeys: true,
    TURNSTILE_SITE_KEY: "0x4AAAAAAArealsite",
    TURNSTILE_SECRET_KEY: "0x4AAAAAAArealsecret",
    TRUST_PROXY: true,
    DB_TESTS_ALLOWED: undefined,
  },
  admins: [{ email: "pemilik@anytix.web.id", active: true, has2fa: true }],
  migrationFiles: ["0001_schema.sql", "0002_engine.sql"],
  appliedMigrations: ["0001_schema.sql", "0002_engine.sql"],
  cronJobs: ["sweep-expired-holds", "purge-identity-numbers"],
  testEventCount: 0,
  site: { name: "AnyTix", csWhatsapp: "6281234567890", csEmail: "cs@anytix.web.id", terms: "S&K", privacy: "Privasi" },
  smtp: { host: "smtp-relay.brevo.com", from: "AnyTix <noreply@anytix.web.id>" },
  paymentMethodsEnabled: 2,
};

describe("runPreflight", () => {
  it("a clean production snapshot passes every check", () => {
    const rows = runPreflight(clean);
    expect(rows.filter((r) => !r.ok)).toEqual([]);
    expect(rows.length).toBeGreaterThanOrEqual(13);
  });

  it("preflight names every blocking problem", () => {
    const rows = runPreflight({
      env: {
        APP_URL: "https://example-casing-tiara.ngrok-free.dev",
        MIDTRANS_IS_PRODUCTION: false,
        hasMidtransKeys: false,
        TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
        TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
        TRUST_PROXY: false,
        DB_TESTS_ALLOWED: "true",
      },
      admins: [
        { email: "admin@admin.com", active: true, has2fa: true },
        { email: "staf@anytix.web.id", active: true, has2fa: false },
        { email: "uji@anytix.test", active: false, has2fa: false },
      ],
      migrationFiles: ["0001_schema.sql", "0002_engine.sql"],
      appliedMigrations: ["0001_schema.sql"],
      cronJobs: ["sweep-expired-holds"],
      testEventCount: 3,
      site: { name: "AnyTix", csWhatsapp: "", csEmail: undefined, terms: "", privacy: "x" },
      smtp: { host: "smtp-relay.brevo.com", from: "address@gmail.com" },
      paymentMethodsEnabled: 0,
    });
    const failed = rows.filter((r) => !r.ok).map((r) => r.check);
    expect(failed).toEqual([
      "APP_URL",
      "Midtrans",
      "Turnstile",
      "Proxy",
      "DB tests",
      "Admin email",
      "2FA",
      "Migrations",
      "Cron jobs",
      "Test events",
      "Site settings",
      "SMTP",
      "Payment methods",
    ]);
    const byCheck = Object.fromEntries(rows.map((r) => [r.check, r.detail]));
    expect(byCheck["Admin email"]).toContain("admin@admin.com");
    expect(byCheck["Admin email"]).not.toContain("uji@anytix.test");
    expect(byCheck["2FA"]).toContain("staf@anytix.web.id");
    expect(byCheck.Migrations).toContain("0002_engine.sql");
    expect(byCheck["Cron jobs"]).toContain("purge-identity-numbers");
  });

  it("http and localhost urls fail", () => {
    for (const url of ["http://anytix.web.id", "https://localhost:3000"]) {
      expect(runPreflight({ ...clean, env: { ...clean.env, APP_URL: url } }).find((r) => r.check === "APP_URL")?.ok).toBe(false);
    }
  });
});
