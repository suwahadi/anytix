import { describe, expect, it } from "vitest";
import { footerColumns, isActive, publicNav } from "@/lib/public/nav";

const withContact = { csWhatsapp: "6281234567890", csEmail: "" };
const noContact = { csWhatsapp: "", csEmail: "" };

describe("public nav", () => {
  it("nav hides contact without CS details", () => {
    expect(publicNav(withContact).map((i) => i.label)).toEqual(["Beranda", "Jelajah Event", "Tentang", "Hubungi Kami"]);
    expect(publicNav(noContact).map((i) => i.label)).toEqual(["Beranda", "Jelajah Event", "Tentang"]);
  });

  it("soon items have no href", () => {
    const tentang = publicNav(withContact).find((i) => i.label === "Tentang");
    expect(tentang).toEqual({ label: "Tentang", soon: true });
    expect(publicNav(withContact).find((i) => i.label === "Hubungi Kami")).toMatchObject({ href: "/#kontak" });
  });

  it("jelajah is active on event pages", () => {
    const [beranda, jelajah] = publicNav(noContact);
    expect(isActive(jelajah, "/events/abc")).toBe(true);
    expect(isActive(jelajah, "/events")).toBe(true);
    expect(isActive(beranda, "/events")).toBe(false);
    expect(isActive(beranda, "/")).toBe(true);
  });

  it("footer lists five categories with events then all", () => {
    const cats = Array.from({ length: 7 }, (_, i) => ({ id: i, name: `Kat ${i}`, slug: `kat-${i}`, icon: null, eventCount: i === 2 ? 0 : 1 }));
    const kategori = footerColumns(withContact, cats).find((c) => c.title === "Kategori Event");
    expect(kategori?.items.map((i) => i.label)).toEqual(["Kat 0", "Kat 1", "Kat 3", "Kat 4", "Kat 5", "Semua Kategori"]);
    expect(kategori?.items[0]).toMatchObject({ href: "/events?category=kat-0" });
    expect(kategori?.items.at(-1)).toMatchObject({ href: "/events" });
  });

  it("footer informasi links exist", () => {
    const cols = footerColumns(noContact, []);
    expect(cols.map((c) => c.title)).toEqual(["Tentang Kami", "Informasi", "Kategori Event"]);
    expect(cols[1].items).toEqual([
      { label: "Syarat & Ketentuan", href: "/terms" },
      { label: "Kebijakan Privasi & Pemrosesan Data", href: "/privacy" },
      { label: "FAQ", soon: true },
    ]);
    expect(cols[0].items).toEqual([
      { label: "Tentang", soon: true },
      { label: "Biaya", soon: true },
    ]);
    expect(footerColumns(withContact, [])[0].items.at(-1)).toEqual({ label: "Hubungi Kami", href: "/#kontak" });
  });
});
