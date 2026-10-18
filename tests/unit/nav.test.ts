import { describe, expect, it } from "vitest";
import { footerColumns, isActive, publicNav } from "@/lib/public/nav";

describe("public nav", () => {
  it("header links every built page", () => {
    expect(publicNav()).toEqual([
      { label: "Beranda", href: "/", match: "exact" },
      { label: "Jelajah Event", href: "/events", match: "prefix" },
      { label: "Tentang", href: "/about", match: "exact" },
      { label: "Hubungi Kami", href: "/contact", match: "exact" },
    ]);
  });

  it("jelajah is active on event pages", () => {
    const [beranda, jelajah, tentang] = publicNav();
    expect(isActive(jelajah, "/events/abc")).toBe(true);
    expect(isActive(jelajah, "/events")).toBe(true);
    expect(isActive(beranda, "/events")).toBe(false);
    expect(isActive(beranda, "/")).toBe(true);
    expect(isActive(tentang, "/about")).toBe(true);
  });

  it("footer lists five categories with events then all", () => {
    const cats = Array.from({ length: 7 }, (_, i) => ({ id: i, name: `Kat ${i}`, slug: `kat-${i}`, icon: null, eventCount: i === 2 ? 0 : 1 }));
    const kategori = footerColumns(cats).find((c) => c.title === "Kategori Event");
    expect(kategori?.items.map((i) => i.label)).toEqual(["Kat 0", "Kat 1", "Kat 3", "Kat 4", "Kat 5", "Semua Kategori"]);
    expect(kategori?.items[0]).toMatchObject({ href: "/events?category=kat-0" });
    expect(kategori?.items.at(-1)).toMatchObject({ href: "/events" });
  });

  it("footer links the content pages and keeps unbuilt ones as coming soon", () => {
    const cols = footerColumns([]);
    expect(cols.map((c) => c.title)).toEqual(["Tentang Kami", "Informasi", "Kategori Event"]);
    expect(cols[0].items).toEqual([
      { label: "Tentang", href: "/about" },
      { label: "Biaya", soon: true },
      { label: "Hubungi Kami", href: "/contact" },
    ]);
    expect(cols[1].items).toEqual([
      { label: "Syarat & Ketentuan", href: "/terms" },
      { label: "Kebijakan Privasi", href: "/privacy" },
      { label: "FAQ", href: "/faq" },
    ]);
  });
});
