import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon, ExternalLinkIcon, HelpCircleIcon, MailIcon, TicketIcon, WhatsAppIcon } from "@/components/icons";
import { localPhone, whatsappUrl } from "@/lib/format";
import { getPublicPages, getPublicSite } from "@/lib/public/catalog-queries";

export const metadata: Metadata = {
  title: "Hubungi Kami",
  description: "Hubungi tim AnyTix lewat WhatsApp atau email untuk pertanyaan soal tiket, pembayaran, dan e-ticket.",
};

function Channel({
  href,
  external,
  icon,
  tile,
  label,
  value,
  action,
}: {
  href: string;
  external?: boolean;
  icon: ReactNode;
  tile: string;
  label: string;
  value: string;
  action: string;
}) {
  return (
    <a
      href={href}
      {...(external && { target: "_blank", rel: "noopener noreferrer" })}
      className="group flex h-full flex-col gap-5 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent sm:p-6"
    >
      <div className="flex items-center gap-4">
        <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl text-white ${tile}`}>{icon}</span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-base font-bold text-text">{label}</h2>
          <p className="break-all text-lg font-semibold text-text">{value}</p>
        </div>
      </div>
      <span className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-surface-muted px-4 text-sm font-semibold text-text transition-colors group-hover:bg-accent group-hover:text-on-accent">
        {action}
        {external && (
          <>
            <ExternalLinkIcon className="size-4" />
            <span className="sr-only">(tab baru)</span>
          </>
        )}
      </span>
    </a>
  );
}

function Shortcut({ href, icon, title, note }: { href: string; icon: ReactNode; title: string; note: string }) {
  return (
    <Link href={href} className="group flex items-center gap-4 rounded-lg px-3 py-3 transition-colors hover:bg-surface-muted">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold text-text">{title}</span>
        <span className="text-sm text-muted">{note}</span>
      </span>
      <ChevronRightIcon className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  );
}

export default async function ContactPage() {
  const [pages, site] = await Promise.all([getPublicPages(), getPublicSite()]);
  const hasChannel = Boolean(site.csWhatsapp || site.csEmail);

  return (
    <article className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 lg:py-12">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl">Hubungi Kami</h1>
        <p className="mx-auto max-w-xl text-muted">Ada kendala soal tiket, pembayaran, atau e-ticket? Pilih cara yang paling mudah untuk Anda.</p>
      </header>

      {hasChannel && (
        <div className="grid gap-4 sm:grid-cols-2">
          {site.csWhatsapp && (
            <Channel
              href={whatsappUrl(site.csWhatsapp, site.name)}
              external
              icon={<WhatsAppIcon className="size-6" />}
              tile="bg-[#1DA851]"
              label="WhatsApp"
              value={localPhone(site.csWhatsapp)}
              action="Mulai chat"
            />
          )}
          {site.csEmail && (
            <Channel
              href={`mailto:${site.csEmail}?subject=${encodeURIComponent(`Pertanyaan untuk ${site.name}`)}`}
              icon={<MailIcon className="size-6" />}
              tile="bg-accent"
              label="Email"
              value={site.csEmail}
              action="Kirim email"
            />
          )}
        </div>
      )}

      <nav aria-label="Bantuan mandiri" className="rounded-xl border border-border bg-surface p-2 sm:p-3">
        <div className="grid sm:grid-cols-2">
          <Shortcut href="/track" icon={<TicketIcon className="size-5" />} title="Lacak Pesanan" note="Status pembayaran dan e-ticket Anda." />
          <Shortcut href="/faq" icon={<HelpCircleIcon className="size-5" />} title="FAQ" note="Jawaban untuk pertanyaan yang paling sering diajukan." />
        </div>
      </nav>

      {pages.contact && <div className="rich-text text-text" dangerouslySetInnerHTML={{ __html: pages.contact }} />}
      {!pages.contact && !hasChannel && <p className="text-center text-muted">Belum diisi pengelola.</p>}
    </article>
  );
}
