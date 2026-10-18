export type PreflightSnapshot = {
  env: {
    APP_URL: string;
    MIDTRANS_IS_PRODUCTION: boolean;
    hasMidtransKeys: boolean;
    TURNSTILE_SITE_KEY: string;
    TURNSTILE_SECRET_KEY: string;
    TRUST_PROXY: boolean;
    DB_TESTS_ALLOWED: string | undefined;
  };
  admins: Array<{ email: string; active: boolean; has2fa: boolean }>;
  migrationFiles: string[];
  appliedMigrations: string[];
  cronJobs: string[];
  testEventCount: number;
  site: { name: string; csWhatsapp: string; csEmail: string | undefined; terms: string; privacy: string };
  smtp: { host: string; from: string } | null;
  paymentMethodsEnabled: number;
};

export type PreflightRow = { check: string; ok: boolean; detail: string };

const REQUIRED_CRON = ["sweep-expired-holds", "purge-identity-numbers"];
const PLACEHOLDER_EMAIL = /@admin\.com$|@example\.com$|\.test$/i;
const TEST_TURNSTILE = /^[123]x000/;

function host(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.hostname : null;
  } catch {
    return null;
  }
}

const row = (check: string, ok: boolean, pass: string, fail: string): PreflightRow => ({ check, ok, detail: ok ? pass : fail });

/** Go-live gate over a read-only snapshot; every failing row names what to fix. */
export function runPreflight(s: PreflightSnapshot): PreflightRow[] {
  const appHost = host(s.env.APP_URL);
  const publicHost = appHost !== null && appHost !== "localhost" && appHost !== "127.0.0.1" && !/ngrok|trycloudflare/.test(appHost);
  const active = s.admins.filter((a) => a.active);
  const placeholder = active.filter((a) => PLACEHOLDER_EMAIL.test(a.email)).map((a) => a.email);
  const no2fa = active.filter((a) => !a.has2fa).map((a) => a.email);
  const missing = s.migrationFiles.filter((f) => !s.appliedMigrations.includes(f));
  const cronMissing = REQUIRED_CRON.filter((j) => !s.cronJobs.includes(j));
  const siteMissing = [
    !s.site.name && "nama situs",
    !s.site.csWhatsapp && !s.site.csEmail && "kontak CS",
    !s.site.terms.trim() && "teks S&K",
    !s.site.privacy.trim() && "teks Kebijakan Privasi",
  ].filter(Boolean);
  const fromDomain = s.smtp?.from.match(/@([^\s>]+)>?$/)?.[1]?.toLowerCase() ?? "";

  return [
    row("APP_URL", publicHost, `${s.env.APP_URL}`, `APP_URL harus https ke domain publik, sekarang ${s.env.APP_URL || "(kosong)"}.`),
    row(
      "Midtrans",
      s.env.MIDTRANS_IS_PRODUCTION && s.env.hasMidtransKeys,
      "Mode produksi, key terisi.",
      "Set MIDTRANS_IS_PRODUCTION=true dan isi MIDTRANS_SERVER_KEY serta MIDTRANS_CLIENT_KEY produksi.",
    ),
    row(
      "Turnstile",
      !TEST_TURNSTILE.test(s.env.TURNSTILE_SITE_KEY) && !TEST_TURNSTILE.test(s.env.TURNSTILE_SECRET_KEY),
      "Key asli.",
      "Turnstile masih memakai test key Cloudflare. Buat site key untuk domain ini.",
    ),
    row("Proxy", s.env.TRUST_PROXY, "TRUST_PROXY=true.", "Set TRUST_PROXY=true di belakang Nginx agar IP klien tidak bisa dipalsukan."),
    row(
      "DB tests",
      s.env.DB_TESTS_ALLOWED !== "true",
      "Test database tidak diizinkan.",
      "Hapus DB_TESTS_ALLOWED=true: test database tidak boleh berjalan ke database produksi.",
    ),
    row("Admin email", active.length > 0 && placeholder.length === 0, `${active.length} admin aktif.`, active.length === 0 ? "Tidak ada admin aktif." : `Ganti atau nonaktifkan: ${placeholder.join(", ")}.`),
    row("2FA", no2fa.length === 0, "Semua admin aktif memakai 2FA.", `Aktifkan 2FA untuk: ${no2fa.join(", ")}.`),
    row("Migrations", missing.length === 0, "Semua migrasi terpasang.", `Belum terpasang: ${missing.join(", ")}. Jalankan deploy/deploy.sh.`),
    row("Cron jobs", cronMissing.length === 0, "Sweeper dan retensi identitas terjadwal.", `Job pg_cron hilang: ${cronMissing.join(", ")}.`),
    row("Test events", s.testEventCount === 0, "Tidak ada event uji.", `${s.testEventCount} event uji (slug test-%) masih ada.`),
    row("Site settings", siteMissing.length === 0, "Lengkap.", `Lengkapi di Pengaturan → Situs: ${siteMissing.join(", ")}.`),
    row(
      "SMTP",
      Boolean(s.smtp?.host) && appHost !== null && (fromDomain === appHost || fromDomain.endsWith(`.${appHost}`) || appHost.endsWith(`.${fromDomain}`)),
      `Pengirim ${s.smtp?.from}.`,
      `Alamat pengirim harus memakai domain ${appHost ?? "APP_URL"} (DKIM), sekarang ${s.smtp?.from ?? "SMTP belum diatur"}.`,
    ),
    row("Payment methods", s.paymentMethodsEnabled > 0, `${s.paymentMethodsEnabled} metode aktif.`, "Aktifkan minimal satu metode pembayaran."),
  ];
}
