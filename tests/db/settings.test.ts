import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PUT as putRoute } from "@/app/api/admin/settings/[group]/route";
import { UserError } from "@/lib/admin-route";
import { ADMIN_COOKIE, createSessionValue } from "@/lib/admin-session";
import { createAdmin } from "@/lib/admin-service";
import { decrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { getSettingsGroup, putSettingsGroup } from "@/lib/settings-service";
import { getTransactionSettings } from "@/lib/settings";
import { siteSettings } from "@/lib/validation/settings";

let adminId = 0;
let snapshot: Array<{ key: string; value: unknown; secret_enc: Buffer | null }> = [];

beforeAll(async () => {
  adminId = await createAdmin(`test-admin-${randomUUID().slice(0, 8)}@example.com`, "rahasia-panjang-123");
  snapshot = await sql`select key, value, secret_enc from settings`;
});

afterAll(async () => {
  await sql`delete from settings where not (key = any(${snapshot.map((r) => r.key)}))`;
  for (const row of snapshot) {
    await sql`update settings set value = ${sql.json(row.value as never)}, secret_enc = ${row.secret_enc} where key = ${row.key}`;
  }
  await sql`delete from audit_logs where admin_id = ${adminId}`;
  await sql`delete from admins where id = ${adminId}`;
});

const transaction = {
  holdMinutes: 3,
  payMinutes: 15,
  payGraceMinutes: 5,
  serviceFee: 5000,
  paymentMethods: { qris: true, va: { bca: true, bni: true, bri: true, mandiri: true, permata: true, cimb: true } },
};

describe("settings", () => {
  it("reads transaction defaults", async () => {
    const s = await getTransactionSettings();
    expect(s).toMatchObject({ holdMinutes: 3, payMinutes: 15, payGraceMinutes: 5, serviceFee: 5000 });
    expect(s.paymentMethods.qris).toBe(true);
    expect(s.paymentMethods.va.bca).toBe(true);
  });

  it("holdMinutes 31 is rejected", async () => {
    const res = await putRoute(
      new NextRequest("http://localhost/api/admin/settings/transaction", {
        method: "PUT",
        body: JSON.stringify({ ...transaction, holdMinutes: 31 }),
        headers: { "content-type": "application/json", cookie: `${ADMIN_COOKIE}=${createSessionValue(adminId)}` },
      }),
      { params: Promise.resolve({ group: "transaction" }) },
    );
    expect(res.status).toBe(422);
    expect((await res.json()).fields.holdMinutes).toBeDefined();
  });

  it("saves transaction settings", async () => {
    await putSettingsGroup(adminId, "transaction", { ...transaction, holdMinutes: 7, serviceFee: 0 });
    expect(await getTransactionSettings()).toMatchObject({ holdMinutes: 7, serviceFee: 0 });
    expect(await getSettingsGroup("transaction")).toMatchObject({ holdMinutes: 7, serviceFee: 0 });
  });

  it("smtp password is stored encrypted and never returned", async () => {
    await putSettingsGroup(adminId, "smtp", { host: "mail.uji.test", port: 587, user: "uji", password: "sandi-rahasia", from: "Anytix <a@uji.test>" });
    const group = await getSettingsGroup("smtp");
    expect(group).toEqual({ host: "mail.uji.test", port: 587, user: "uji", from: "Anytix <a@uji.test>", hasPassword: true });
    const [row] = await sql<{ value: Record<string, unknown>; secret_enc: Buffer }[]>`select value, secret_enc from settings where key = 'smtp'`;
    expect(JSON.stringify(row.value)).not.toContain("sandi-rahasia");
    expect(decrypt(Buffer.from(row.secret_enc))).toBe("sandi-rahasia");
    const audits = await sql`select diff from audit_logs where admin_id = ${adminId} and entity = 'settings'`;
    expect(JSON.stringify(audits)).not.toContain("sandi-rahasia");
  });

  it("empty password keeps the stored one", async () => {
    await putSettingsGroup(adminId, "smtp", { host: "mail.uji.test", port: 587, user: "uji", password: "lama-123", from: "a@uji.test" });
    await putSettingsGroup(adminId, "smtp", { host: "mail.uji.test", port: 465, user: "uji", password: "", from: "a@uji.test" });
    const [row] = await sql<{ secret_enc: Buffer }[]>`select secret_enc from settings where key = 'smtp'`;
    expect(decrypt(Buffer.from(row.secret_enc))).toBe("lama-123");
    expect((await getSettingsGroup("smtp")).port).toBe(465);
  });

  it("smtp host change needs the password again", async () => {
    await putSettingsGroup(adminId, "smtp", { host: "mail.uji.test", port: 587, user: "uji", password: "lama-123", from: "a@uji.test" });
    const err = await putSettingsGroup(adminId, "smtp", { host: "mail.lain.test", port: 587, user: "uji", password: "", from: "a@uji.test" }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UserError);
    expect((err as UserError).status).toBe(422);
    expect((err as UserError).fields?.password).toBe("Isi ulang kata sandi karena host SMTP berubah.");
    expect((await getSettingsGroup("smtp")).host).toBe("mail.uji.test");
  });

  it("all payment methods off is refused", async () => {
    const off = { qris: false, va: { bca: false, bni: false, bri: false, mandiri: false, permata: false, cimb: false } };
    const res = await putRoute(
      new NextRequest("http://localhost/api/admin/settings/transaction", {
        method: "PUT",
        body: JSON.stringify({ ...transaction, paymentMethods: off }),
        headers: { "content-type": "application/json", cookie: `${ADMIN_COOKIE}=${createSessionValue(adminId)}` },
      }),
      { params: Promise.resolve({ group: "transaction" }) },
    );
    expect(res.status).toBe(422);
    expect((await res.json()).fields.paymentMethods).toBe("Aktifkan minimal satu metode pembayaran.");
  });

  it("privacy timestamp changes only with the privacy text", async () => {
    const site = { name: "Anytix", logoPath: null, csWhatsapp: "081234567890", csEmail: "cs@uji.test", terms: "<p>S&amp;K</p>", privacy: "<p>Privasi v1</p>" };
    await putSettingsGroup(adminId, "site", siteSettings.parse(site));
    const first = (await getSettingsGroup("site")).privacyUpdatedAt;
    expect(first).toBeTruthy();
    expect((await getSettingsGroup("site")).csWhatsapp).toBe("6281234567890");
    await new Promise((r) => setTimeout(r, 20));
    await putSettingsGroup(adminId, "site", siteSettings.parse({ ...site, name: "Anytix Baru" }));
    expect((await getSettingsGroup("site")).privacyUpdatedAt).toBe(first);
    await putSettingsGroup(adminId, "site", siteSettings.parse({ ...site, privacy: "<p>Privasi v2</p>" }));
    expect((await getSettingsGroup("site")).privacyUpdatedAt).not.toBe(first);
  });

  it("email templates round trip and reject unknown placeholders", async () => {
    const put = (body: unknown) =>
      putRoute(
        new NextRequest("http://localhost/api/admin/settings/email_templates", {
          method: "PUT",
          body: JSON.stringify(body),
          headers: { "content-type": "application/json", cookie: `${ADMIN_COOKIE}=${createSessionValue(adminId)}` },
        }),
        { params: Promise.resolve({ group: "email_templates" }) },
      );
    const defaults = await getSettingsGroup("email_templates");
    expect(defaults.paid.subject).toBe("Pembayaran berhasil: {{event}}");

    const edited = { ...defaults, paid: { subject: "Tiket {{event}} siap", body: "Terima kasih {{nama}}." } };
    const ok = await put(edited);
    expect(ok.status).toBe(200);
    expect((await getSettingsGroup("email_templates")).paid).toEqual({ subject: "Tiket {{event}} siap", body: "Terima kasih {{nama}}." });

    const bad = await put({ ...defaults, expired: { subject: "Halo {{namaa}}", body: "x" } });
    expect(bad.status).toBe(422);
    expect((await bad.json()).fields["expired.subject"]).toBe("Placeholder {{namaa}} tidak dikenal.");
  });
});
