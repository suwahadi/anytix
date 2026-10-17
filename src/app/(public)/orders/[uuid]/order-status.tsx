"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Countdown } from "@/components/countdown";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { isFinalizing, shouldPoll, type DisplayStatus } from "@/lib/booking/order-status";
import type { OrderView } from "@/lib/booking/order-view";
import { requestJson } from "@/lib/client-fetch";
import { formatDateTime, formatEventSchedule, formatRupiah } from "@/lib/format";
import type { Timezone } from "@/lib/validation/catalog";

type Snap = { pay: (token: string, callbacks: Record<string, () => void>) => void };

declare global {
  interface Window {
    snap?: Snap;
  }
}

const POLL_MS = 5000;
const TONE: Record<DisplayStatus, BadgeTone> = {
  PENDING: "warning",
  LUNAS: "success",
  KEDALUWARSA: "muted",
  DIBATALKAN: "muted",
  DITINJAU: "warning",
  DIKEMBALIKAN: "muted",
};

let snapLoading: Promise<void> | null = null;

function loadSnap(src: string, clientKey: string): Promise<void> {
  if (window.snap) return Promise.resolve();
  snapLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.dataset.clientKey = clientKey;
    s.onload = () => resolve();
    s.onerror = () => {
      snapLoading = null;
      reject(new Error("snap failed to load"));
    };
    document.head.appendChild(s);
  });
  return snapLoading;
}

export function OrderStatus({ initial, cs }: { initial: OrderView; cs: { whatsapp: string; email: string } }) {
  const [view, setView] = useState(initial);
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [opening, setOpening] = useState(false);
  const [snapError, setSnapError] = useState("");
  const tz = view.event.timezone as Timezone;
  const schedule = formatEventSchedule(new Date(view.event.startsAt), new Date(view.event.endsAt), tz);
  const pending = view.displayStatus === "PENDING";
  const polling = shouldPoll(view.status);
  const finalizing = isFinalizing(view.status, view.displayStatus);

  const refresh = useCallback(async () => {
    const res = await requestJson<OrderView>(`/api/orders/${view.uuid}`);
    if (res.ok) {
      setView(res.data);
      setReceivedAt(Date.now());
    }
  }, [view.uuid]);

  const openSnap = useCallback(async () => {
    setOpening(true);
    setSnapError("");
    const res = await requestJson<{ token: string; clientKey: string; scriptUrl: string }>(`/api/orders/${view.uuid}/pay`, { method: "POST" });
    if (!res.ok) {
      setOpening(false);
      setSnapError(res.error);
      return;
    }
    try {
      await loadSnap(res.data.scriptUrl, res.data.clientKey);
      window.snap?.pay(res.data.token, {
        onSuccess: () => void refresh(),
        onPending: () => void refresh(),
        onError: () => setSnapError("Pembayaran gagal diproses. Coba lagi atau pilih Bayar Sekarang sekali lagi."),
        onClose: () => {},
      });
    } catch {
      setSnapError("Halaman pembayaran tidak bisa dimuat. Periksa koneksi lalu coba lagi.");
    }
    setOpening(false);
  }, [view.uuid, refresh]);

  useEffect(() => {
    if (!pending) return;
    const key = `anytix:snap-opened:${view.uuid}`;
    let opened = true;
    try {
      opened = localStorage.getItem(key) === "1";
      if (!opened) localStorage.setItem(key, "1");
    } catch {}
    if (!opened) queueMicrotask(() => void openSnap());
  }, [pending, view.uuid, openSnap]);

  useEffect(() => {
    if (!polling) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      clearInterval(timer);
      if (document.visibilityState === "visible") timer = setInterval(() => void refresh(), POLL_MS);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [polling, refresh]);

  const contact = [cs.whatsapp && `WhatsApp +${cs.whatsapp}`, cs.email].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 lg:py-10">
      {pending && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning bg-warning-soft px-4 py-3">
          <span className="font-semibold text-text">Selesaikan Pembayaran</span>
          <Countdown expiresAt={view.payExpiresAt} serverNow={view.serverNow} receivedAt={receivedAt} onExpire={() => void refresh()} />
        </div>
      )}

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-text">
            {view.displayStatus === "LUNAS" ? "Pembayaran berhasil" : view.displayStatus === "PENDING" ? "Menunggu pembayaran" : "Status pesanan"}
          </h1>
          <Badge tone={TONE[view.displayStatus]}>{view.displayStatus}</Badge>
        </div>

        {pending && (
          <p className="text-text">
            Silakan lakukan pembayaran sebelum <strong>{formatDateTime(new Date(view.payExpiresAt), tz)}</strong>.
          </p>
        )}
        {finalizing && (
          <p className="text-text">Batas bayar sudah lewat. Kami sedang memastikan status pembayaran Anda, dan halaman ini diperbarui otomatis.</p>
        )}
        {view.displayStatus === "KEDALUWARSA" && !finalizing && <p className="text-text">Batas bayar sudah lewat, jadi pesanan ini dibatalkan dan slot tiket dilepas.</p>}
        {view.displayStatus === "DIBATALKAN" && <p className="text-text">Pesanan ini dibatalkan oleh pengelola sebelum dibayar.</p>}
        {view.displayStatus === "DITINJAU" && (
          <p className="text-text">
            Pembayaran Anda masuk setelah batas waktu. Pengelola akan menghubungi Anda untuk pengembalian dana.{contact && ` Kontak: ${contact}.`}
          </p>
        )}
        {view.displayStatus === "DIKEMBALIKAN" && <p className="text-text">Dana pesanan ini sudah dikembalikan oleh pengelola.{contact && ` Kontak: ${contact}.`}</p>}

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">ID Pesanan</dt>
            <dd className="font-semibold text-text">{view.invoice}</dd>
          </div>
          <div>
            <dt className="text-muted">Metode</dt>
            <dd className="font-semibold text-text">{view.paymentMethod.label}</dd>
          </div>
          <div>
            <dt className="text-muted">Total</dt>
            <dd className="text-lg font-extrabold text-accent-text">{formatRupiah(view.total)}</dd>
          </div>
          <div>
            <dt className="text-muted">Pemesan</dt>
            <dd className="font-semibold text-text">{view.buyerName}</dd>
          </div>
        </dl>

        {pending && (
          <div className="flex flex-col gap-2">
            {snapError && <Alert>{snapError}</Alert>}
            <Button onClick={() => void openSnap()} loading={opening} className="self-stretch sm:self-start">
              Bayar Sekarang
            </Button>
            <p className="text-sm text-muted">Halaman ini diperbarui otomatis setelah pembayaran diterima.</p>
          </div>
        )}
        {((view.displayStatus === "KEDALUWARSA" && !finalizing) || view.displayStatus === "DIBATALKAN") && (
          <Link href={`/events/${view.event.slug}`} className={`${buttonClass()} self-start`}>
            Pesan lagi
          </Link>
        )}
      </section>

      {view.displayStatus === "LUNAS" && (
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-text">E-ticket</h2>
            <a href={`/api/orders/${view.uuid}/tickets.pdf`} download className={buttonClass("secondary")}>
              Unduh PDF
            </a>
          </div>
          <p className="text-sm text-muted">Satu QR untuk satu orang. Tunjukkan di pintu masuk, dari layar atau cetakan.</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {view.tickets.map((t) => (
              <li key={t.seq} className="flex flex-col items-center gap-2 rounded-md border border-border p-4 text-center">
                <span className="font-semibold text-text">
                  Tiket {t.seq} dari {view.tickets.length}
                </span>
                <span className="text-sm text-muted">
                  {t.categoryName} · {view.buyerName}
                </span>
                {t.qr && (
                  // eslint-disable-next-line @next/next/no-img-element -- a data: URL needs no optimisation and the custom image loader would rewrite it
                  <img src={t.qr} alt={`QR Tiket ${t.seq} dari ${view.tickets.length}`} width={208} height={208} className="rounded-md bg-white p-2" />
                )}
                {t.token && <code className="break-all font-mono text-sm text-text">{t.token}</code>}
                {t.checkedInAt && (
                  <Badge tone="muted">Sudah dipakai {formatDateTime(new Date(t.checkedInAt), tz)}</Badge>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:p-6">
        <h2 className="text-lg font-bold text-text">{view.event.title}</h2>
        <p className="text-sm text-muted">
          {schedule.date} · {schedule.time}
          {(view.event.venue || view.event.city) && <> · {[view.event.venue, view.event.city].filter(Boolean).join(", ")}</>}
        </p>
        <ul className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
          {view.items.map((i) => (
            <li key={i.name} className="flex justify-between gap-3">
              <span className="text-text">
                {i.name} × {i.qty}
              </span>
              <span className="font-semibold text-text">{formatRupiah(i.lineTotal)}</span>
            </li>
          ))}
          {view.discount > 0 && (
            <li className="flex justify-between gap-3">
              <span className="text-muted">Diskon</span>
              <span className="text-text">−{formatRupiah(view.discount)}</span>
            </li>
          )}
          <li className="flex justify-between gap-3">
            <span className="text-muted">Biaya Layanan</span>
            <span className="text-text">{formatRupiah(view.fee)}</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
