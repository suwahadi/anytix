"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EyeIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminOrderDetail } from "@/lib/admin/order-admin-service";
import { requestJson } from "@/lib/client-fetch";
import { EMAIL_TYPE_LABELS, type EmailType } from "@/lib/email/templates";
import { formatRupiah } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/validation/settings";
import { formatAdminTime, ORDER_STATUS } from "../order-labels";

type Action = "cancel" | "resend" | "issue" | "refund" | "reissue";

const PAYMENT_STATUS: Record<string, string> = {
  pending: "Menunggu",
  settlement: "Lunas",
  expire: "Kedaluwarsa",
  cancel: "Dibatalkan",
  deny: "Ditolak",
  failure: "Gagal",
};

const CONFIRM: Record<Exclude<Action, "resend">, { title: string; body: string; button: string; path: string; done: string; danger?: true }> = {
  cancel: {
    title: "Batalkan pesanan?",
    body: "Pembayaran di Midtrans ikut dibatalkan, slot tiket dan voucher dilepas, dan pembeli tidak bisa membayar pesanan ini lagi.",
    button: "Ya, batalkan pesanan",
    path: "cancel",
    danger: true,
    done: "Pesanan dibatalkan.",
  },
  issue: {
    title: "Terbitkan tiket?",
    body: "Pastikan kuota kategori tiket sudah dinaikkan. Tiket terbit dan email pembayaran berhasil dikirim ke pembeli.",
    button: "Terbitkan tiket",
    path: "issue-tickets",
    done: "Tiket diterbitkan.",
  },
  reissue: {
    title: "Terbitkan ulang QR?",
    body: "QR lama tidak bisa dipakai lagi. Tiket yang sudah check-in tidak diubah. Pembeli melihat QR baru di tautan pesanan yang sama.",
    button: "Terbitkan ulang QR",
    path: "reissue-tickets",
    danger: true,
    done: "QR baru diterbitkan.",
  },
  refund: {
    title: "Tandai sudah direfund?",
    body: "Lakukan ini setelah dana dikembalikan lewat dashboard Midtrans. Status pesanan menjadi Dikembalikan.",
    button: "Tandai sudah direfund",
    path: "mark-refunded",
    done: "Pesanan ditandai sudah direfund.",
  },
};

function answerText(a: AdminOrderDetail["answers"][number]): string {
  const v = a.value as unknown;
  if (a.type === "identity" && v && typeof v === "object") {
    const id = v as { type?: string; number?: string };
    return `${id.type ?? ""} ${id.number ?? ""}`.trim();
  }
  if (Array.isArray(v)) return v.join(", ");
  return v === null || v === undefined ? "" : String(v);
}


const BUYER_LABEL = "text-muted after:content-[':']";

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [to, setTo] = useState("");
  const [toError, setToError] = useState("");
  const [updateEmail, setUpdateEmail] = useState(false);
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string> | null>(null);

  // Next keeps a left page alive in the background; a revealed identity number must not survive navigation.
  useEffect(() => () => setRevealed(null), []);

  useEffect(() => {
    let active = true;
    requestJson<{ order: AdminOrderDetail }>(`/api/admin/orders/${id}`).then((res) => {
      if (!active) return;
      if (res.ok) setOrder(res.data.order);
      else setError(res.error);
    });
    return () => {
      active = false;
    };
  }, [id]);

  async function run(path: string, done: string, body?: unknown) {
    setBusy(true);
    setActionError("");
    setToError("");
    const res = await requestJson<{ order: AdminOrderDetail }>(`/api/admin/orders/${id}/${path}`, { method: "POST", body: body ?? {} });
    setBusy(false);
    if (!res.ok) {
      if (res.fields?.to) setToError(res.fields.to);
      else setActionError(res.error);
      return;
    }
    setOrder(res.data.order);
    setOpen(null);
    setNotice(done);
  }

  async function reveal() {
    setBusy(true);
    setActionError("");
    const res = await requestJson<{ identities: Array<{ label: string; number: string }> }>(`/api/admin/orders/${id}/reveal-identity`, { method: "POST", body: {} });
    setBusy(false);
    if (!res.ok) return setActionError(res.error);
    setRevealed(Object.fromEntries(res.data.identities.map((i) => [i.label, i.number])));
    setRevealOpen(false);
  }

  if (error) return <Alert>{error}</Alert>;
  if (!order) return <Skeleton className="mt-6 h-96" />;

  const status = ORDER_STATUS[order.status];
  const method = PAYMENT_METHODS.find((m) => m.key === order.paymentMethod);
  const canResend = ["awaiting_payment", "paid", "expired", "late_paid_review"].includes(order.status);
  const confirm = open && open !== "resend" ? CONFIRM[open] : null;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/orders" className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent-text underline-offset-4 hover:underline">
        ← Kembali ke daftar pesanan
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-text">{order.invoice}</h1>
        <Badge tone={status?.tone}>{status?.label ?? order.status}</Badge>
      </div>
      {notice && <Alert tone="success">{notice}</Alert>}
      {order.status === "late_paid_review" && (
        <Alert tone="warning">Pembayaran masuk setelah slot dilepas dan kuota tidak cukup. Naikkan kuota lalu terbitkan tiket, atau kembalikan dana lalu tandai sudah direfund.</Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {order.status === "awaiting_payment" && (
          <Button variant="secondary" onClick={() => (setActionError(""), setOpen("cancel"))}>
            Batalkan pesanan
          </Button>
        )}
        {canResend && (
          <Button variant="secondary" onClick={() => (setActionError(""), setTo(order.buyer.email), setUpdateEmail(false), setOpen("resend"))}>
            Kirim ulang email
          </Button>
        )}
        {order.status === "paid" && (
          <Button variant="secondary" onClick={() => (setActionError(""), setOpen("reissue"))}>
            Terbitkan ulang QR
          </Button>
        )}
        {order.status === "late_paid_review" && (
          <>
            <Button onClick={() => (setActionError(""), setOpen("issue"))}>Terbitkan tiket</Button>
            <Button variant="secondary" onClick={() => (setActionError(""), setOpen("refund"))}>
              Tandai sudah direfund
            </Button>
          </>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:p-5">
          <h2 className="text-lg font-bold text-text">Ringkasan</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Event</dt>
              <dd className="font-semibold text-text">{order.event.title}</dd>
            </div>
            <div>
              <dt className="text-muted">Metode</dt>
              <dd className="font-semibold text-text">{method?.label ?? order.paymentMethod}</dd>
            </div>
            <div>
              <dt className="text-muted">Dibuat</dt>
              <dd className="text-text">{formatAdminTime(order.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted">{order.paidAt ? "Dibayar" : "Batas bayar"}</dt>
              <dd className="text-text">{formatAdminTime(order.paidAt ?? order.payExpiresAt)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted">UUID pesanan</dt>
              <dd className="break-all text-text">{order.publicUuid}</dd>
            </div>
          </dl>
          <ul className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
            {order.items.map((i) => (
              <li key={i.name} className="flex justify-between gap-3">
                <span className="text-text">
                  {i.name} × {i.qty}
                </span>
                <span className="text-text">{formatRupiah(i.qty * i.unitPrice)}</span>
              </li>
            ))}
            {order.discount > 0 && (
              <li className="flex justify-between gap-3 text-muted">
                <span>Diskon</span>
                <span>−{formatRupiah(order.discount)}</span>
              </li>
            )}
            <li className="flex justify-between gap-3 text-muted">
              <span>Biaya layanan</span>
              <span>{formatRupiah(order.fee)}</span>
            </li>
            <li className="flex justify-between gap-3 font-bold text-text">
              <span>Total</span>
              <span>{formatRupiah(order.total)}</span>
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:p-5">
          <h2 className="text-lg font-bold text-text">Pemesan</h2>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-2 text-sm">
            <div className="contents">
              <dt className={BUYER_LABEL}>Nama</dt>
              <dd className="font-semibold text-text">{order.buyer.name}</dd>
            </div>
            <div className="contents">
              <dt className={BUYER_LABEL}>Email</dt>
              <dd className="break-all text-text">{order.buyer.email}</dd>
            </div>
            <div className="contents">
              <dt className={BUYER_LABEL}>WhatsApp</dt>
              <dd className="text-text">+{order.buyer.phone}</dd>
            </div>
            {order.answers.map((a) => {
              const identity = a.type === "identity" ? (a.value as { type?: string; number?: string }) : null;
              return (
                <div key={a.label} className="contents">
                  <dt className={identity?.number ? `${BUYER_LABEL} self-center` : BUYER_LABEL}>{a.label}</dt>
                  {identity && !identity.number ? (
                    <dd className="text-muted">{identity.type} · dihapus otomatis 60 hari setelah acara</dd>
                  ) : identity ? (
                    <dd className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 text-text sm:flex sm:flex-wrap sm:gap-y-1">
                      <span className="font-mono">
                        {identity.type} {revealed?.[a.label] ?? identity.number}
                      </span>
                      {!revealed?.[a.label] && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => (setActionError(""), setRevealOpen(true))}
                          aria-label="Tampilkan nomor lengkap"
                          title="Tampilkan nomor lengkap"
                          className="whitespace-nowrap max-sm:size-10 max-sm:px-0"
                        >
                          <EyeIcon className="size-[18px]" />
                          <span className="max-sm:sr-only">Tampilkan nomor lengkap</span>
                        </Button>
                      )}
                    </dd>
                  ) : (
                    <dd className="break-words text-text">{answerText(a) || "Tidak diisi"}</dd>
                  )}
                </div>
              );
            })}
          </dl>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:p-5">
          <h2 className="text-lg font-bold text-text">Pembayaran</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {order.payments.map((p) => (
              <li key={p.attempt} className="flex flex-wrap justify-between gap-2">
                <span className="break-all text-text">{p.midtransOrderId}</span>
                <span className="text-muted">
                  {PAYMENT_STATUS[p.status] ?? p.status}
                  {p.hasSnapToken ? " · Snap dibuat" : ""}
                </span>
              </li>
            ))}
          </ul>
          <h3 className="mt-2 text-sm font-semibold text-text">Notifikasi Midtrans</h3>
          {order.paymentEvents.length === 0 ? (
            <p className="text-sm text-muted">Belum ada notifikasi dari Midtrans.</p>
          ) : (
            <ol className="flex flex-col gap-1 text-sm">
              {order.paymentEvents.map((e, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="text-text">{e.transactionStatus}</span>
                  <span className="text-muted">{formatAdminTime(e.receivedAt)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:p-5">
          <h2 className="text-lg font-bold text-text">Log Email</h2>
          {order.emails.length === 0 ? (
            <p className="text-sm text-muted">Belum ada email terkirim. Pastikan worker berjalan.</p>
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              {order.emails.map((e, i) => (
                <li key={i} className="flex flex-col">
                  <span className="text-text">
                    {EMAIL_TYPE_LABELS[e.type as EmailType] ?? e.type} ke <span className="break-all">{e.toEmail}</span>
                  </span>
                  <span className={e.status === "sent" ? "text-muted" : "text-danger"}>
                    {e.status === "sent" ? "Terkirim" : `Gagal: ${e.error ?? ""}`} · {formatAdminTime(e.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <Dialog
        open={Boolean(confirm)}
        onClose={() => setOpen(null)}
        title={confirm?.title ?? ""}
        footer={
          confirm && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(null)}>
                Batal
              </Button>
              <Button variant={confirm.danger ? "danger" : "primary"} loading={busy} onClick={() => run(confirm.path, confirm.done)}>
                {confirm.button}
              </Button>
            </div>
          )
        }
      >
        <p className="text-sm text-text">{confirm?.body}</p>
        {actionError && (
          <div className="mt-3">
            <Alert>{actionError}</Alert>
          </div>
        )}
      </Dialog>

      <Dialog
        open={revealOpen}
        onClose={() => setRevealOpen(false)}
        title="Tampilkan nomor identitas?"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setRevealOpen(false)}>
              Batal
            </Button>
            <Button loading={busy} onClick={reveal}>
              Tampilkan
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text">Tindakan ini tercatat di audit log. Nomor lengkap hanya tampil di halaman ini dan hilang saat Anda pindah halaman.</p>
        {actionError && (
          <div className="mt-3">
            <Alert>{actionError}</Alert>
          </div>
        )}
      </Dialog>

      <Dialog
        open={open === "resend"}
        onClose={() => setOpen(null)}
        title="Kirim ulang email"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Batal
            </Button>
            <Button
              loading={busy}
              onClick={() => run("resend-email", "Email diantrekan untuk dikirim ulang.", { to: to === order.buyer.email ? undefined : to, updateBuyerEmail: updateEmail })}
            >
              Kirim
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Field id="resend-to" label="Kirim ke" type="email" value={to} error={toError} onChange={(e) => setTo(e.target.value)} />
          <Checkbox
            id="resend-update"
            label="Simpan sebagai email pemesan"
            hint="Email berikutnya untuk pesanan ini dikirim ke alamat baru."
            checked={updateEmail}
            onChange={(e) => setUpdateEmail(e.target.checked)}
          />
          {actionError && <Alert>{actionError}</Alert>}
        </div>
      </Dialog>
    </div>
  );
}
