import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { qrPng, qrSvgDataUrl } from "@/lib/tickets/qr";
import { fitLines, renderTicketsPdf } from "@/lib/tickets/ticket-pdf";

const event = {
  title: "Jazz di Taman 2026",
  startsAt: new Date("2026-12-20T12:00:00Z"),
  endsAt: new Date("2026-12-20T15:30:00Z"),
  timezone: "Asia/Jakarta",
  venue: "Taman Ismail Marzuki",
  city: "Jakarta Pusat",
};

async function tickets(n: number) {
  return Promise.all(
    Array.from({ length: n }, async (_, i) => {
      const token = `tok${i}AAAAAAAAAAAAAAAAAAA`;
      return { seq: i + 1, total: n, categoryName: "Reguler", token, qrPng: await qrPng(token) };
    }),
  );
}

describe("ticket pdf", () => {
  it("one page per ticket", async () => {
    const bytes = await renderTicketsPdf({ invoice: "A1234ABCD", buyerName: "Budi Santoso", event, tickets: await tickets(3) });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
  });

  it("worst case text still renders one page per ticket", async () => {
    const long = "Festival Musik Jazz Tahunan Terbesar di Indonesia ".repeat(6);
    const bytes = await renderTicketsPdf({ invoice: "A1234ABCD", buyerName: long, event: { ...event, title: long, venue: long, city: long }, tickets: await tickets(1) });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("pdf survives non latin names", async () => {
    const bytes = await renderTicketsPdf({ invoice: "A1234ABCD", buyerName: "Đặng Thị 🎵 Ünal", event: { ...event, title: "Konser «Ñ» 東京" }, tickets: await tickets(1) });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("qr svg is a data url", async () => {
    expect(await qrSvgDataUrl("abc")).toMatch(/^data:image\/svg\+xml,/);
  });

  it("long words are broken and long titles capped", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.HelveticaBold);
    const word = fitLines(font, "Supercalifragilisticexpialidocious".repeat(4), 14, 250, 3);
    for (const line of word) expect(font.widthOfTextAtSize(line, 14)).toBeLessThanOrEqual(250);
    const title = fitLines(font, "Festival Musik Jazz Tahunan Terbesar di Indonesia ".repeat(6), 14, 250, 3);
    expect(title).toHaveLength(3);
    expect(title[2].endsWith("…")).toBe(true);
    for (const line of title) expect(font.widthOfTextAtSize(line, 14)).toBeLessThanOrEqual(250);
  });
});
