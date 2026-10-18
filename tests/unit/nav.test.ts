import { describe, expect, it } from "vitest";
import { isActive, publicNav } from "@/lib/public/nav";

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
});
