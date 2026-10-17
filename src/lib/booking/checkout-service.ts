import { UserError } from "@/lib/admin-route";
import { getHoldView } from "@/lib/booking/hold-view";
import { encrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { parseEngineError } from "@/lib/db-errors";
import { buildAnswersSchema, type IdentityAnswer } from "@/lib/form-schema";
import { getSettingsGroup } from "@/lib/settings-service";

export type CheckoutInput = {
  holdId: string;
  visitorId: string;
  buyer: { name: string; email: string; phone: string };
  answers: Record<string, unknown>;
  paymentMethod: string;
  consents: { terms: boolean; privacy: boolean };
  ip: string | null;
};

const EXPIRED = "Waktu habis, slot dilepas";

export async function checkoutHold(input: CheckoutInput): Promise<{ orderId: number; orderUuid: string }> {
  const view = await getHoldView(input.holdId, input.visitorId);
  if (!view) throw new UserError("Pesanan tidak ditemukan.", 404);
  if (!input.consents.terms || !input.consents.privacy) {
    throw new UserError("Periksa kembali isian yang ditandai.", 422, { consents: "Centang kedua persetujuan untuk melanjutkan." });
  }
  if (!view.paymentMethods.some((m) => m.key === input.paymentMethod)) {
    throw new UserError("Periksa kembali isian yang ditandai.", 422, { paymentMethod: "Pilih metode pembayaran." });
  }

  const parsed = buildAnswersSchema(view.fields).safeParse(input.answers);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[`answers.${issue.path.map(String).join(".")}`] ??= issue.message;
    throw new UserError("Periksa kembali isian yang ditandai.", 422, fields);
  }
  const values = parsed.data as Record<string, unknown>;
  const answers = view.fields
    .filter((f) => values[f.key] !== undefined)
    .map((f) => {
      if (f.type !== "identity") return { form_field_id: f.id, value: values[f.key] };
      const identity = values[f.key] as IdentityAnswer;
      return { form_field_id: f.id, value: { type: identity.type }, value_encrypted: encrypt(identity.number).toString("base64") };
    });

  const site = await getSettingsGroup("site");
  const policyVersion = site.privacyUpdatedAt ?? "initial";
  const purposes = ["terms", "privacy", ...(view.hasIdentityField ? ["identity_verification"] : [])];
  const consents = purposes.map((purpose) => ({ policy_version: policyVersion, purpose, ip: input.ip }));

  try {
    const [order] = await sql<{ id: number; public_uuid: string }[]>`
      select id, public_uuid from checkout_hold(${input.holdId}::uuid, ${input.visitorId}::uuid, ${sql.json(input.buyer)},
                                                ${sql.json(answers as never)}, ${input.paymentMethod}, ${null}, ${sql.json(consents)})`;
    return { orderId: order.id, orderUuid: order.public_uuid };
  } catch (e) {
    const engine = parseEngineError(e);
    if (!engine) throw e;
    if (engine.code === "HOLD_EXPIRED") throw new UserError(EXPIRED, 410);
    if (engine.code === "HOLD_NOT_FOUND") throw new UserError("Pesanan tidak ditemukan.", 404);
    if (engine.code === "INVALID_BUYER") throw new UserError("Lengkapi data pemesan.", 422);
    if (engine.code.startsWith("VOUCHER")) throw new UserError("Kode promo tidak bisa dipakai.", 409);
    throw e;
  }
}
