import type { EmailMessage } from "@/lib/email/email-provider";
import { escapeHtml, fillPlaceholders, type EmailTemplates, type EmailType } from "@/lib/email/templates";
import { formatDateTime, formatEventSchedule, formatRupiah, localPhone } from "@/lib/format";
import type { Timezone } from "@/lib/validation/catalog";

export type OrderEmailData = {
  invoice: string;
  publicUuid: string;
  buyerName: string;
  buyerEmail: string;
  total: number;
  payExpiresAt: Date;
  paymentMethodLabel: string;
  items: Array<{ name: string; qty: number; lineTotal: number }>;
  event: { title: string; slug: string; startsAt: Date; endsAt: Date; timezone: string; venue: string; city: string; refundPolicy: string };
  site: { name: string; csWhatsapp: string; csEmail: string };
  appUrl: string;
};

const ACCENT = "#C2410C";

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:6px">${escapeHtml(label)}</a></p>`;
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:4px 12px 4px 0;color:#57534e">${escapeHtml(label)}</td><td style="padding:4px 0;color:#1c1917">${escapeHtml(value)}</td></tr>`;
}

export function renderOrderEmail(type: EmailType, data: OrderEmailData, templates: EmailTemplates): EmailMessage {
  const tz = data.event.timezone as Timezone;
  const orderUrl = `${data.appUrl}/orders/${data.publicUuid}`;
  const eventUrl = `${data.appUrl}/events/${data.event.slug}`;
  const deadline = formatDateTime(data.payExpiresAt, tz);
  const vars = {
    nama: data.buyerName,
    event: data.event.title,
    invoice: data.invoice,
    total: formatRupiah(data.total),
    batas_bayar: deadline,
    tautan_pesanan: orderUrl,
  };
  const template = templates[type];
  const subject = fillPlaceholders(template.subject, vars, false);
  const intro = fillPlaceholders(escapeHtml(template.body), vars, true);
  const introText = fillPlaceholders(template.body, vars, false);
  const schedule = formatEventSchedule(data.event.startsAt, data.event.endsAt, tz);
  const place = [data.event.venue, data.event.city].filter(Boolean).join(", ");
  const contact = [data.site.csWhatsapp && `WhatsApp ${localPhone(data.site.csWhatsapp)}`, data.site.csEmail].filter(Boolean).join(" · ");

  const blocks: string[] = [`<p style="margin:0 0 16px">${intro}</p>`];
  const text: string[] = [introText];

  if (type === "awaiting_payment") {
    const lines = data.items.map((i) => row(`${i.name} × ${i.qty}`, formatRupiah(i.lineTotal))).join("");
    blocks.push(`<table style="border-collapse:collapse;margin:0 0 8px">${lines}${row("Total bayar", formatRupiah(data.total))}${row("Metode", data.paymentMethodLabel)}${row("ID Pesanan", data.invoice)}</table>`);
    blocks.push(`<p style="margin:8px 0 0">Bayar sebelum <strong>${escapeHtml(deadline)}</strong>.</p>`, button(orderUrl, "Bayar Sekarang"));
    text.push(...data.items.map((i) => `${i.name} × ${i.qty}: ${formatRupiah(i.lineTotal)}`), `Total bayar: ${formatRupiah(data.total)}`, `Bayar sebelum ${deadline}`, orderUrl);
  }
  if (type === "paid") {
    blocks.push(button(orderUrl, "Buka E-Ticket"));
    blocks.push(`<table style="border-collapse:collapse;margin:0 0 16px">${row("Acara", data.event.title)}${row("Tanggal", schedule.date)}${row("Waktu", schedule.time)}${place ? row("Lokasi", place) : ""}${row("ID Pesanan", data.invoice)}</table>`);
    if (data.event.refundPolicy) {
      blocks.push(`<p style="margin:0 0 4px;font-weight:600">Kebijakan refund</p><p style="margin:0;white-space:pre-line">${escapeHtml(data.event.refundPolicy)}</p>`);
    }
    text.push(`E-ticket: ${orderUrl}`, `${data.event.title}, ${schedule.date} ${schedule.time}`, place, data.event.refundPolicy ? `Kebijakan refund: ${data.event.refundPolicy}` : "");
  }
  if (type === "expired") {
    blocks.push(button(eventUrl, "Pesan lagi"));
    text.push(`Pesan lagi: ${eventUrl}`);
  }
  if (type === "late_paid" && contact) {
    blocks.push(`<p style="margin:0">Kontak pengelola: ${escapeHtml(contact)}</p>`);
    text.push(`Kontak pengelola: ${contact}`);
  }

  const footer = `${escapeHtml(data.site.name)}${contact ? ` · ${escapeHtml(contact)}` : ""}`;
  const html = `<!doctype html><html lang="id"><body style="margin:0;background:#fafaf9;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1c1917"><div style="max-width:560px;margin:0 auto;padding:24px 16px"><p style="margin:0 0 20px;font-size:20px;font-weight:700">${escapeHtml(data.site.name)}</p><div style="background:#ffffff;border:1px solid #e7e5e4;border-radius:8px;padding:24px">${blocks.join("")}</div><p style="margin:16px 0 0;font-size:13px;color:#57534e">${footer}</p></div></body></html>`;
  return {
    to: data.buyerEmail,
    ...(data.site.csEmail ? { replyTo: data.site.csEmail } : {}),
    subject,
    html,
    text: [...text, data.site.name, contact].filter(Boolean).join("\n"),
  };
}
