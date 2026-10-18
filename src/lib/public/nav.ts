export type NavLink = { label: string; href: string; match?: "exact" | "prefix" };
export type NavSoon = { label: string; soon: true };
export type NavItem = NavLink | NavSoon;

type Contact = { csWhatsapp: string; csEmail: string };

const hasContact = (site: Contact) => Boolean(site.csWhatsapp || site.csEmail);

/** Pages that do not exist yet stay visible as "Segera" with no link, so nothing in the menu leads nowhere. */
export function publicNav(site: Contact): NavItem[] {
  return [
    { label: "Beranda", href: "/", match: "exact" },
    { label: "Jelajah Event", href: "/events", match: "prefix" },
    { label: "Tentang", soon: true },
    ...(hasContact(site) ? [{ label: "Hubungi Kami", href: "/#kontak" }] : []),
  ];
}

export function isActive(item: NavItem, pathname: string): boolean {
  if ("soon" in item || !item.match) return false;
  return item.match === "exact" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export type FooterColumn = { title: string; items: NavItem[] };

export function footerColumns(site: Contact, categories: ReadonlyArray<{ name: string; slug: string; eventCount: number }>): FooterColumn[] {
  return [
    {
      title: "Tentang Kami",
      items: [{ label: "Tentang", soon: true }, { label: "Biaya", soon: true }, ...(hasContact(site) ? [{ label: "Hubungi Kami", href: "/#kontak" }] : [])],
    },
    {
      title: "Informasi",
      items: [
        { label: "Syarat & Ketentuan", href: "/terms" },
        { label: "Kebijakan Privasi & Pemrosesan Data", href: "/privacy" },
        { label: "FAQ", soon: true },
      ],
    },
    {
      title: "Kategori Event",
      items: [
        ...categories
          .filter((c) => c.eventCount > 0)
          .slice(0, 5)
          .map((c) => ({ label: c.name, href: `/events?category=${c.slug}` })),
        { label: "Semua Kategori", href: "/events" },
      ],
    },
  ];
}
