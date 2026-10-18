import { describe, expect, it } from "vitest";
import { renderOrderEmail, type OrderEmailData } from "@/lib/email/render-order-email";
import { DEFAULT_EMAIL_TEMPLATES, fillPlaceholders } from "@/lib/email/templates";

const data: OrderEmailData = {
  invoice: "A1234ABCD",
  publicUuid: "0b7e3c1e-1111-4222-8333-944455556666",
  buyerName: "Budi <b>Santoso</b>",
  buyerEmail: "budi@example.com",
  total: 205000,
  payExpiresAt: new Date("2026-12-01T03:19:00Z"),
  paymentMethodLabel: "QRIS",
  items: [{ name: "Reguler", qty: 2, lineTotal: 200000 }],
  event: {
    title: "Jazz di Taman 2026",
    slug: "jazz-taman-2026",
    startsAt: new Date("2026-12-20T12:00:00Z"),
    endsAt: new Date("2026-12-20T15:30:00Z"),
    timezone: "Asia/Jakarta",
    venue: "Taman Ismail Marzuki",
    city: "Jakarta Pusat",
    refundPolicy: "Refund penuh bila acara batal.",
  },
  site: { name: "Anytix", csWhatsapp: "6281234567890", csEmail: "cs@anytix.web.id" },
  appUrl: "https://anytix.test",
};

describe("email templates", () => {
  it("fills placeholders and escapes HTML only when asked", () => {
    expect(fillPlaceholders("Halo {{nama}}, {{x}}", { nama: "<b>Budi</b>" }, true)).toBe("Halo &lt;b&gt;Budi&lt;/b&gt;, {{x}}");
    expect(fillPlaceholders("Halo {{nama}}", { nama: "<b>Budi</b>" }, false)).toBe("Halo <b>Budi</b>");
  });

  it("replies go to the CS address", () => {
    expect(renderOrderEmail("paid", data, DEFAULT_EMAIL_TEMPLATES).replyTo).toBe("cs@anytix.web.id");
    expect(renderOrderEmail("paid", { ...data, site: { ...data.site, csEmail: "" } }, DEFAULT_EMAIL_TEMPLATES).replyTo).toBeUndefined();
  });

  it("template body is escaped", () => {
    const templates = { ...DEFAULT_EMAIL_TEMPLATES, paid: { subject: "Lunas", body: "Diskon <50% & gratis" } };
    const m = renderOrderEmail("paid", data, templates);
    expect(m.html).toContain("Diskon &lt;50% &amp; gratis");
  });

  it("awaiting payment email lists items, total and the deadline", () => {
    const m = renderOrderEmail("awaiting_payment", data, DEFAULT_EMAIL_TEMPLATES);
    expect(m.to).toBe("budi@example.com");
    expect(m.subject).toContain("A1234ABCD");
    expect(m.html).toContain("Rp205.000");
    expect(m.html).toContain("Selasa, 1 Desember 2026 pukul 10.19 WIB");
    expect(m.html).toContain("https://anytix.test/orders/0b7e3c1e-1111-4222-8333-944455556666");
    expect(m.html).not.toContain("<b>Santoso</b>");
  });

  it("paid email has the order link, schedule, venue and refund policy", () => {
    const m = renderOrderEmail("paid", data, DEFAULT_EMAIL_TEMPLATES);
    expect(m.html).toContain("https://anytix.test/orders/0b7e3c1e-1111-4222-8333-944455556666");
    expect(m.html).toContain("Taman Ismail Marzuki");
    expect(m.html).toContain("Refund penuh bila acara batal.");
    expect(m.text).toContain("https://anytix.test/orders/0b7e3c1e-1111-4222-8333-944455556666");
  });

  it("expired email links to the event and late payment names the CS contact", () => {
    expect(renderOrderEmail("expired", data, DEFAULT_EMAIL_TEMPLATES).html).toContain("https://anytix.test/events/jazz-taman-2026");
    expect(renderOrderEmail("late_paid", data, DEFAULT_EMAIL_TEMPLATES).html).toContain("cs@anytix.web.id");
  });

  it("an edited subject and paragraph replace the defaults", () => {
    const edited = { ...DEFAULT_EMAIL_TEMPLATES, paid: { subject: "Tiket {{event}} siap", body: "Terima kasih {{nama}}." } };
    const m = renderOrderEmail("paid", data, edited);
    expect(m.subject).toBe("Tiket Jazz di Taman 2026 siap");
    expect(m.html).toContain("Terima kasih Budi &lt;b&gt;Santoso&lt;/b&gt;.");
  });
});
