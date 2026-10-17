import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { qrPng, qrSvgDataUrl } from "@/lib/tickets/qr";
import { renderTicketsPdf } from "@/lib/tickets/ticket-pdf";

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

  it("pdf survives non latin names", async () => {
    const bytes = await renderTicketsPdf({ invoice: "A1234ABCD", buyerName: "Đặng Thị 🎵 Ünal", event: { ...event, title: "Konser «Ñ» 東京" }, tickets: await tickets(1) });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("qr svg is a data url", async () => {
    expect(await qrSvgDataUrl("abc")).toMatch(/^data:image\/svg\+xml,/);
  });
});
