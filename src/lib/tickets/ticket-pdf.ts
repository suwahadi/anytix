import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import { formatEventSchedule } from "@/lib/format";
import type { Timezone } from "@/lib/validation/catalog";

export type TicketsPdfData = {
  invoice: string;
  buyerName: string;
  event: { title: string; startsAt: Date; endsAt: Date; timezone: string; venue: string; city: string };
  tickets: Array<{ seq: number; total: number; categoryName: string; token: string; qrPng: Uint8Array }>;
};

const A6: [number, number] = [297.64, 419.53];
const MARGIN = 22;
const INK = rgb(0.11, 0.1, 0.09);
const MUTED = rgb(0.34, 0.33, 0.31);

// shortcut: no embedded font, so characters outside WinAnsi (Vietnamese, CJK, emoji) become "?"; embed a TTF through @pdf-lib/fontkit when buyers need them.
function winAnsi(font: PDFFont, text: string): string {
  const encodable = (c: string) => {
    try {
      font.encodeText(c);
      return true;
    } catch {
      return false;
    }
  };
  return [...text.normalize("NFC")]
    .map((c) => {
      if (encodable(c)) return c;
      const base = c.normalize("NFKD").replace(/\p{M}/gu, "");
      return base && encodable(base) ? base : "?";
    })
    .join("");
}

/** Word-wraps to `width`, splits words that are wider than a line, and ends the last allowed line with "…". */
export function fitLines(font: PDFFont, text: string, size: number, width: number, maxLines: number): string[] {
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= width;
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (fits(next)) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    for (const ch of word) {
      if (line && !fits(line + ch)) {
        lines.push(line);
        line = "";
      }
      line += ch;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  let last = lines[maxLines - 1];
  while (last && !fits(`${last}…`)) last = last.slice(0, -1);
  return [...lines.slice(0, maxLines - 1), `${last.trimEnd()}…`];
}

/** One A6 page per admitted person; the QR carries only the opaque token (PRD §15). */
export async function renderTicketsPdf(data: TicketsPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`E-ticket ${data.invoice}`);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const schedule = formatEventSchedule(data.event.startsAt, data.event.endsAt, data.event.timezone as Timezone);
  const place = [data.event.venue, data.event.city].filter(Boolean).join(", ");
  const width = A6[0] - MARGIN * 2;

  for (const t of data.tickets) {
    const page = doc.addPage(A6);
    let y = A6[1] - MARGIN;
    const text = (value: string, font: PDFFont, size: number, color = INK, maxLines = 2) => {
      for (const line of fitLines(font, winAnsi(font, value), size, width, maxLines)) {
        y -= size + 3;
        page.drawText(line, { x: MARGIN, y, size, font, color });
      }
    };

    text(data.event.title, bold, 14, INK, 3);
    y -= 2;
    text(schedule.date, regular, 9, MUTED);
    text(schedule.time, regular, 9, MUTED);
    if (place) text(place, regular, 9, MUTED);
    y -= 8;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A6[0] - MARGIN, y }, thickness: 0.5, color: MUTED });
    y -= 6;
    text(t.categoryName, bold, 12);
    text(`Tiket ${t.seq} dari ${t.total}`, regular, 10);
    text(data.buyerName, regular, 10);

    // Space left above the token line and footer; a 120 pt (42 mm) QR still scans reliably at the gate.
    const size = Math.max(120, Math.min(170, y - 10 - 14 - MARGIN - 12));
    const qr = await doc.embedPng(t.qrPng);
    y -= size + 10;
    page.drawImage(qr, { x: (A6[0] - size) / 2, y, width: size, height: size });
    const tokenWidth = mono.widthOfTextAtSize(t.token, 9);
    y -= 14;
    page.drawText(t.token, { x: (A6[0] - tokenWidth) / 2, y, size: 9, font: mono, color: INK });
    page.drawText(winAnsi(regular, `Invoice ${data.invoice} · Tunjukkan QR ini di pintu masuk.`), {
      x: MARGIN,
      y: MARGIN - 4,
      size: 7.5,
      font: regular,
      color: MUTED,
    });
  }
  return doc.save();
}
