"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { MailIcon, TicketIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { PendingOverlay } from "@/components/ui/pending-overlay";
import { Toast, type ToastMessage } from "@/components/ui/toast";
import { requestJson } from "@/lib/client-fetch";

const FIELD = "h-12 w-full min-w-0 rounded-md border border-border-strong bg-surface pl-10 pr-3 text-base text-text placeholder:text-muted";
const ICON = "pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted";

export function TrackForm() {
  const router = useRouter();
  const [invoice, setInvoice] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  useEffect(
    () => () => {
      setLoading(false);
    },
    [],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!invoice.trim() || !email.trim()) {
      setToast({ id: Date.now(), tone: "error", text: "Isi kode pesanan dan email terlebih dahulu." });
      return;
    }
    setLoading(true);
    const res = await requestJson<{ href: string }>("/api/orders/track", { body: { invoice, email } });
    if (!res.ok) {
      setLoading(false);
      setToast({ id: Date.now(), tone: "error", text: res.error });
      return;
    }
    setToast({ id: Date.now(), tone: "success", text: "Pesanan ditemukan. Membuka halaman pesanan…" });
    router.push(res.data.href);
  }

  return (
    <>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:p-6">
        <div className="relative">
          <label htmlFor="track-invoice" className="sr-only">
            Kode pesanan
          </label>
          <TicketIcon className={ICON} />
          <input
            id="track-invoice"
            name="invoice"
            value={invoice}
            onChange={(e) => setInvoice(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
            placeholder="Kode pesanan"
            className={`${FIELD} font-mono uppercase placeholder:font-sans placeholder:normal-case`}
          />
        </div>
        <div className="relative">
          <label htmlFor="track-email" className="sr-only">
            Alamat email
          </label>
          <MailIcon className={ICON} />
          <input
            id="track-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            placeholder="Alamat email"
            className={FIELD}
          />
        </div>
        <Button type="submit" loading={loading} className="h-12 w-full">
          Lacak Pesanan
        </Button>
      </form>
      <Toast toast={toast} onClose={closeToast} />
      <PendingOverlay show={loading} label="Mencari pesanan…" />
    </>
  );
}
