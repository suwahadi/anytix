import type { Metadata } from "next";
import { MailIcon, WhatsAppIcon } from "@/components/icons";
import { localPhone, whatsappUrl } from "@/lib/format";
import { getPublicPages, getPublicSite } from "@/lib/public/catalog-queries";

export const metadata: Metadata = { title: "Hubungi Kami" };

const CARD = "flex min-h-20 items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent hover:bg-accent-soft";

export default async function ContactPage() {
  const [pages, site] = await Promise.all([getPublicPages(), getPublicSite()]);
  const channels = [
    site.csWhatsapp && { key: "wa", href: whatsappUrl(site.csWhatsapp, site.name), Icon: WhatsAppIcon, label: "WhatsApp", value: localPhone(site.csWhatsapp), external: true },
    site.csEmail && { key: "mail", href: `mailto:${site.csEmail}`, Icon: MailIcon, label: "Email", value: site.csEmail },
  ].filter(Boolean) as Array<{ key: string; href: string; Icon: typeof MailIcon; label: string; value: string; external?: boolean }>;

  return (
    <article className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:py-10">
      <h1 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl">Hubungi Kami</h1>
      {channels.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {channels.map(({ key, href, Icon, label, value, external }) => (
            <li key={key}>
              <a href={href} className={CARD} {...(external && { target: "_blank", rel: "noopener noreferrer" })}>
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                  <Icon className="size-6" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm text-muted">{label}</span>
                  <span className="break-all font-semibold text-text">{value}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {pages.contact && <div className="rich-text text-text" dangerouslySetInnerHTML={{ __html: pages.contact }} />}
      {!pages.contact && channels.length === 0 && <p className="text-muted">Belum diisi pengelola.</p>}
    </article>
  );
}
