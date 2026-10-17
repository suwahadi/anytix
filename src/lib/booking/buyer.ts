import { z } from "zod";

export const COUNTRY_CODES = [
  { code: "62", label: "+62 ID" },
  { code: "60", label: "+60 MY" },
  { code: "65", label: "+65 SG" },
  { code: "61", label: "+61 AU" },
  { code: "1", label: "+1 US" },
] as const;

type CountryCode = (typeof COUNTRY_CODES)[number]["code"];

/** WhatsApp number as plain digits with the country code, the `62…` form PRD §14 asks for. */
export function normalizePhone(countryCode: string, input: string): string | null {
  const digits = input.replace(/\D/g, "");
  let rest = digits;
  if (digits.startsWith(countryCode) && digits.length - countryCode.length >= 8) rest = digits.slice(countryCode.length);
  if (rest.startsWith("0")) rest = rest.slice(1);
  const phone = countryCode + rest;
  return phone.length >= 10 && phone.length <= 15 ? phone : null;
}

const PHONE_ERROR = "Nomor WhatsApp tidak valid.";

export const buyerInput = z
  .object({
    name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(100, "Nama maksimal 100 karakter."),
    email: z.string().trim().max(254, "Email tidak valid.").email("Email tidak valid."),
    countryCode: z.enum(COUNTRY_CODES.map((c) => c.code) as [CountryCode, ...CountryCode[]]).default("62"),
    phone: z.string().max(40, PHONE_ERROR),
  })
  .superRefine((v, ctx) => {
    if (!normalizePhone(v.countryCode, v.phone)) ctx.addIssue({ code: "custom", path: ["phone"], message: PHONE_ERROR });
  })
  .transform((v) => ({ name: v.name, email: v.email, phone: normalizePhone(v.countryCode, v.phone) as string }));

export type BuyerValues = z.infer<typeof buyerInput>;
