import { sql } from "@/lib/db";

const INVOICE = /^A[0-9A-HJKMNP-TV-Z]{8}$/;

/** Invoice codes are "A" plus 8 Crockford base32 characters, so O, I and L typed by a buyer can only mean 0, 1 and 1. */
export function normalizeInvoice(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return INVOICE.test(code) ? code : null;
}

/** Both the invoice and the buyer email must match, so a guessed invoice alone reveals nothing. */
export async function findOrderUuid(invoice: string, email: string): Promise<string | null> {
  const [row] = await sql<{ public_uuid: string }[]>`
    select public_uuid from orders where invoice_code = ${invoice} and buyer_email = ${email.trim().toLowerCase()}`;
  return row?.public_uuid ?? null;
}
