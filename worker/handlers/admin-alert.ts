import { sql } from "@/lib/db";
import { getEmailProvider } from "@/lib/email/email-provider";
import { escapeHtml } from "@/lib/email/templates";
import { getEnv } from "@/lib/env";
import { formatRupiah } from "@/lib/format";

type Alert = { subject: string; lines: string[]; link: string };

async function lateAlert(orderId: number): Promise<Alert | null> {
  const [o] = await sql<{ invoice_code: string; buyer_name: string; total: number; title: string }[]>`
    select o.invoice_code, o.buyer_name, o.total, e.title from orders o join events e on e.id = o.event_id where o.id = ${orderId}`;
  if (!o) return null;
  return {
    subject: `Perlu tindak lanjut: pembayaran terlambat ${o.invoice_code}`,
    lines: [
      `Pembayaran pesanan ${o.invoice_code} (${o.title}, ${o.buyer_name}, ${formatRupiah(Number(o.total))}) masuk setelah slot dilepas, dan kuota tidak cukup.`,
      "Naikkan kuota lalu terbitkan tiket, atau kembalikan dana di dashboard Midtrans lalu tandai sudah direfund.",
    ],
    link: `${getEnv().APP_URL}/admin/orders/${orderId}`,
  };
}

function driftAlert(rows: unknown): Alert {
  const list = Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
  return {
    subject: "Selisih kuota terdeteksi",
    lines: [
      "Rekonsiliasi menemukan angka held/sold yang tidak cocok dan sudah memperbaikinya:",
      ...list.map((r) => `Inventori ${r.inventory_id}: held ${r.held_actual} → ${r.held_expected}, sold ${r.sold_actual} → ${r.sold_expected}`),
    ],
    link: `${getEnv().APP_URL}/admin`,
  };
}

export async function adminAlertJob(payload: Record<string, unknown>): Promise<void> {
  const kind = payload.kind === "drift" ? "drift" : "late_paid";
  const alert = kind === "drift" ? driftAlert(payload.rows) : await lateAlert(Number(payload.order_id));
  if (!alert) return;
  const admins = await sql<{ email: string }[]>`select email from admins where is_active order by id`;
  if (admins.length === 0) return;
  const provider = await getEmailProvider();
  const html = `${alert.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}<p><a href="${escapeHtml(alert.link)}">Buka panel admin</a></p>`;
  const text = [...alert.lines, alert.link].join("\n");
  for (const admin of admins) await provider.send({ to: admin.email, subject: alert.subject, html, text });
}
