export type NavLink = { label: string; href: string; match?: "exact" | "prefix" };
export type NavSoon = { label: string; soon: true };
export type NavItem = NavLink | NavSoon;

/** Pages that do not exist yet stay visible as "Segera" with no link, so nothing in the menu leads nowhere. */
export function publicNav(): NavItem[] {
  return [
    { label: "Beranda", href: "/", match: "exact" },
    { label: "Jelajah Event", href: "/events", match: "prefix" },
    { label: "Tentang", href: "/about", match: "exact" },
    { label: "Hubungi Kami", href: "/contact", match: "exact" },
  ];
}

export function isActive(item: NavItem, pathname: string): boolean {
  if ("soon" in item || !item.match) return false;
  return item.match === "exact" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export type FooterColumn = { title: string; items: NavItem[] };

export function footerColumns(categories: ReadonlyArray<{ name: string; slug: string; eventCount: number }>): FooterColumn[] {
  return [
    {
      title: "Tentang Kami",
      items: [{ label: "Tentang", href: "/about" }, { label: "Biaya", soon: true }, { label: "Hubungi Kami", href: "/contact" }],
    },
    {
      title: "Informasi",
      items: [
        { label: "Syarat & Ketentuan", href: "/terms" },
        { label: "Kebijakan Privasi", href: "/privacy" },
        { label: "FAQ", href: "/faq" },
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
