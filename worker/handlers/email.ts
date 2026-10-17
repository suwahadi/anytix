import { sql } from "@/lib/db";
import { getEmailProvider } from "@/lib/email/email-provider";
import { loadOrderEmailData, renderOrderEmail } from "@/lib/email/order-emails";
import { EMAIL_TYPES, getEmailTemplates, type EmailType } from "@/lib/email/templates";
import { maskEmail } from "@/lib/mask";

export async function emailJob(payload: Record<string, unknown>): Promise<void> {
  const type = payload.type as EmailType;
  const orderId = Number(payload.order_id);
  if (!EMAIL_TYPES.includes(type)) throw new Error(`unknown email type ${String(payload.type)}`);
  const data = await loadOrderEmailData(orderId);
  if (!data) return;
  const to = typeof payload.to === "string" && payload.to ? payload.to : data.buyerEmail;
  const message = { ...renderOrderEmail(type, data, await getEmailTemplates()), to };
  try {
    const provider = await getEmailProvider();
    const { messageId } = await provider.send(message);
    await sql`insert into email_logs (order_id, type, to_email, message_id, status) values (${orderId}, ${type}, ${to}, ${messageId}, 'sent')`;
    console.log(`email ${type} for order ${orderId} sent to ${maskEmail(to)}`);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await sql`insert into email_logs (order_id, type, to_email, status, error) values (${orderId}, ${type}, ${to}, 'failed', ${error})`;
    throw e;
  }
}
