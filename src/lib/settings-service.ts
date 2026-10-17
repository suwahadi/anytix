import { diffFields, writeAudit } from "@/lib/audit";
import { encrypt } from "@/lib/crypto";
import { sql, transaction } from "@/lib/db";
import { invalidatePublic, TAG_SITE } from "@/lib/public-cache";
import { sanitizeRichText } from "@/lib/rich-text";
import type { SiteSettingsValues, SmtpSettingsValues, TransactionSettingsValues } from "@/lib/validation/settings";

export type SiteView = {
  name: string;
  logoPath: string | null;
  csWhatsapp: string;
  csEmail: string;
  terms: string;
  privacy: string;
  privacyUpdatedAt: string | null;
};

export type SmtpView = { host: string; port: number; user: string; from: string; hasPassword: boolean };

type StoredSite = {
  name?: string;
  logo_path?: string | null;
  cs_whatsapp?: string;
  cs_email?: string;
  terms?: string;
  privacy?: string;
  privacy_updated_at?: string | null;
};

async function rows(keys: string[]) {
  const result = await sql<{ key: string; value: unknown; secret_enc: Buffer | null }[]>`
    select key, value, secret_enc from settings where key = any(${keys})`;
  return Object.fromEntries(result.map((r) => [r.key, r]));
}

export async function getSettingsGroup(group: "transaction"): Promise<TransactionSettingsValues>;
export async function getSettingsGroup(group: "site"): Promise<SiteView>;
export async function getSettingsGroup(group: "smtp"): Promise<SmtpView>;
export async function getSettingsGroup(group: "transaction" | "site" | "smtp") {
  if (group === "transaction") {
    const r = await rows(["hold_minutes", "pay_minutes", "pay_grace_minutes", "service_fee", "payment_methods"]);
    return {
      holdMinutes: Number(r.hold_minutes?.value),
      payMinutes: Number(r.pay_minutes?.value),
      payGraceMinutes: Number(r.pay_grace_minutes?.value),
      serviceFee: Number(r.service_fee?.value),
      paymentMethods: r.payment_methods?.value as TransactionSettingsValues["paymentMethods"],
    };
  }
  if (group === "site") {
    const site = ((await rows(["site"])).site?.value ?? {}) as StoredSite;
    return {
      name: site.name ?? "Anytix",
      logoPath: site.logo_path ?? null,
      csWhatsapp: site.cs_whatsapp ?? "",
      csEmail: site.cs_email ?? "",
      terms: site.terms ?? "",
      privacy: site.privacy ?? "",
      privacyUpdatedAt: site.privacy_updated_at ?? null,
    } satisfies SiteView;
  }
  const row = (await rows(["smtp"])).smtp;
  const value = (row?.value ?? {}) as Partial<SmtpView>;
  return {
    host: value.host ?? "",
    port: Number(value.port ?? 587),
    user: value.user ?? "",
    from: value.from ?? "",
    hasPassword: Boolean(row?.secret_enc),
  } satisfies SmtpView;
}

async function setValue(tx: Parameters<Parameters<typeof transaction>[0]>[0], key: string, value: unknown) {
  await tx`
    insert into settings (key, value, updated_at) values (${key}, ${tx.json(value as never)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

export async function putSettingsGroup(adminId: number, group: "transaction", input: TransactionSettingsValues): Promise<void>;
export async function putSettingsGroup(adminId: number, group: "site", input: SiteSettingsValues): Promise<void>;
export async function putSettingsGroup(adminId: number, group: "smtp", input: SmtpSettingsValues): Promise<void>;
export async function putSettingsGroup(
  adminId: number,
  group: "transaction" | "site" | "smtp",
  input: TransactionSettingsValues | SiteSettingsValues | SmtpSettingsValues,
): Promise<void> {
  if (group === "transaction") {
    const t = input as TransactionSettingsValues;
    const before = await getSettingsGroup("transaction");
    await transaction(async (tx) => {
      await setValue(tx, "hold_minutes", t.holdMinutes);
      await setValue(tx, "pay_minutes", t.payMinutes);
      await setValue(tx, "pay_grace_minutes", t.payGraceMinutes);
      await setValue(tx, "service_fee", t.serviceFee);
      await setValue(tx, "payment_methods", t.paymentMethods);
      await writeAudit(tx, { adminId, action: "update", entity: "settings", entityId: "transaction", diff: diffFields(before, t) });
    });
    return;
  }

  if (group === "site") {
    const s = input as SiteSettingsValues;
    const before = await getSettingsGroup("site");
    const privacy = sanitizeRichText(s.privacy);
    const stored: StoredSite = {
      name: s.name,
      logo_path: s.logoPath ?? null,
      cs_whatsapp: s.csWhatsapp,
      cs_email: s.csEmail ?? "",
      terms: sanitizeRichText(s.terms),
      privacy,
      privacy_updated_at: privacy !== before.privacy ? new Date().toISOString() : before.privacyUpdatedAt,
    };
    await transaction(async (tx) => {
      await setValue(tx, "site", stored);
      await writeAudit(tx, {
        adminId,
        action: "update",
        entity: "settings",
        entityId: "site",
        diff: diffFields(
          { name: before.name, logoPath: before.logoPath, csWhatsapp: before.csWhatsapp, csEmail: before.csEmail, privacyChanged: false },
          { name: s.name, logoPath: s.logoPath ?? null, csWhatsapp: s.csWhatsapp, csEmail: s.csEmail ?? "", privacyChanged: privacy !== before.privacy },
        ),
      });
    });
    invalidatePublic(TAG_SITE);
    return;
  }

  const m = input as SmtpSettingsValues;
  const before = await getSettingsGroup("smtp");
  const value = { host: m.host, port: m.port, user: m.user, from: m.from };
  await transaction(async (tx) => {
    await setValue(tx, "smtp", value);
    if (m.password) await tx`update settings set secret_enc = ${encrypt(m.password)} where key = 'smtp'`;
    await writeAudit(tx, {
      adminId,
      action: "update",
      entity: "settings",
      entityId: "smtp",
      diff: { ...diffFields({ host: before.host, port: before.port, user: before.user, from: before.from }, value), passwordChanged: Boolean(m.password) },
    });
  });
}
