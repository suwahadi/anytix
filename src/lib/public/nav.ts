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
