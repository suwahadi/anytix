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

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
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
    const text = (value: string, font: PDFFont, size: number, color = INK) => {
      for (const line of wrap(font, winAnsi(font, value), size, width)) {
        y -= size + 3;
        page.drawText(line, { x: MARGIN, y, size, font, color });
      }
    };

    text(data.event.title, bold, 14);
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

    const size = 170;
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
