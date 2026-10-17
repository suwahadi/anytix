"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { TurnstileWidget, type TurnstileHandle } from "@/components/turnstile-widget";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client-fetch";
import { formatRupiah } from "@/lib/format";
import type { TicketBadge } from "@/lib/ticket-status";

type Category = {
  id: number;
  inventoryId: number;
  name: string;
  description: string;
  price: number;
  maxPerOrder: number;
  admitsPerUnit: number;
  hasMerchandise: boolean;
  badge: TicketBadge;
};

const REFRESH_MS = 15_000;
/** The availability endpoint lists active categories only, so one missing from it was hidden or removed. */
const CLOSED: TicketBadge = { label: "Penjualan ditutup", tone: "muted", buyable: false, remaining: 0 };
/** aria-disabled instead of disabled so keyboard focus stays on the stepper at its limits. */
const stepClass = "w-11 px-0 aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

export const selectionKey = (eventId: number) => `anytix:selection:${eventId}`;

const noSubscription = () => () => {};

function readStored(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function TicketPicker({ slug, eventId, siteKey, categories }: { slug: string; eventId: number; siteKey: string; categories: Category[] }) {
  const router = useRouter();
  const [badges, setBadges] = useState<Record<number, TicketBadge>>(() => Object.fromEntries(categories.map((c) => [c.id, c.badge])));
  const stored = useSyncExternalStore(noSubscription, () => readStored(selectionKey(eventId)), () => null);
  const restored = useMemo(() => {
    try {
      return stored ? (JSON.parse(stored) as Record<number, number>) : {};
    } catch {
      return {};
    }
  }, [stored]);
  const [edited, setQty] = useState<Record<number, number> | null>(null);
  const qty = edited ?? restored;
  const [token, setToken] = useState("");
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState("");
  const turnstile = useRef<TurnstileHandle>(null);
  const idempotencyKey = useRef("");

  // Next keeps this page's state while the buyer is on /checkout; start fresh when they come back.
  useEffect(
    () => () => {
      setBuying(false);
      setToken("");
      idempotencyKey.current = "";
    },
    [],
  );


  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    async function refresh() {
      try {
        const res = await fetch(`/api/events/${slug}/availability`);
        if (!res.ok) return;
        const body: { categories: Array<{ id: number; badge: TicketBadge }> } = await res.json();
        const fresh = new Map(body.categories.map((c) => [c.id, c.badge]));
        setBadges((prev) => Object.fromEntries(Object.keys(prev).map((id) => [id, fresh.get(Number(id)) ?? CLOSED])));
      } catch {}
    }
    function sync() {
      clearInterval(timer);
      if (document.visibilityState !== "visible") return;
      refresh();
      timer = setInterval(refresh, REFRESH_MS);
    }
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [slug]);

  const limitOf = (c: Category) => {
    const badge = badges[c.id] ?? c.badge;
    return badge.buyable ? Math.min(c.maxPerOrder, badge.remaining) : 0;
  };
  const chosen = categories
    .map((c) => ({ category: c, count: Math.min(qty[c.id] ?? 0, limitOf(c)) }))
    .filter((line) => line.count > 0);
  const subtotal = chosen.reduce((sum, line) => sum + line.count * line.category.price, 0);
  const units = chosen.reduce((sum, line) => sum + line.count, 0);
  const setCount = (id: number, count: number) => {
    idempotencyKey.current = "";
    setQty({ ...qty, [id]: count });
  };

  async function buy() {
    if (chosen.length === 0 || buying) return;
    setBuying(true);
    setBuyError("");
    idempotencyKey.current ||= crypto.randomUUID();
    const res = await requestJson<{ holdId: string }>("/api/holds", {
      body: { eventId, items: chosen.map((l) => ({ inventoryId: l.category.inventoryId, qty: l.count })), turnstileToken: token },
      headers: { "idempotency-key": idempotencyKey.current },
    });
    if (res.ok) {
      try {
        sessionStorage.setItem(selectionKey(eventId), JSON.stringify(Object.fromEntries(chosen.map((l) => [l.category.id, l.count]))));
      } catch {}
      router.push(`/checkout/${res.data.holdId}`);
      return;
    }
    setBuying(false);
    setBuyError(res.error);
    idempotencyKey.current = "";
    setToken("");
    turnstile.current?.reset();
    if (res.body?.code === "SOLD_OUT") {
      const category = categories.find((c) => c.inventoryId === res.body?.inventoryId);
      if (category) setQty({ ...qty, [category.id]: Number(res.body?.available ?? 0) });
    }
  }

  if (categories.length === 0) {
    return <p className="rounded-lg border border-dashed border-border-strong px-4 py-10 text-center text-muted">Tiket untuk event ini belum tersedia.</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-10">
      <ul className="flex min-w-0 flex-col gap-4">
        {categories.map((c) => {
          const badge = badges[c.id] ?? c.badge;
          const limit = limitOf(c);
          const count = Math.min(qty[c.id] ?? 0, limit);
          return (
            <li key={c.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={badge.tone}>{badge.label}</Badge>
                {c.hasMerchandise && <Badge>+ Merchandise</Badge>}
                {c.admitsPerUnit > 1 && <Badge>Bundle (isi {c.admitsPerUnit})</Badge>}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-text">{c.name}</h2>
                  <p className="text-lg font-extrabold text-accent-text">{formatRupiah(c.price)}</p>
                  {badge.label === "Hampir habis" && <p className="text-sm font-semibold text-warning">Sisa {badge.remaining} tiket</p>}
                </div>
                {badge.buyable &&
                  (!(c.id in qty) ? (
                    <Button variant="secondary" onClick={() => setCount(c.id, 1)} className="sm:w-32" aria-label={`Pilih ${c.name}`}>
                      Pilih
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2" role="group" aria-label={`Jumlah ${c.name}`}>
                      <Button
                        variant="secondary"
                        onClick={() => count > 0 && setCount(c.id, count - 1)}
                        aria-disabled={count === 0}
                        className={stepClass}
                        aria-label={`Kurangi ${c.name}`}
                      >
                        −
                      </Button>
                      <output aria-live="polite" className="w-10 text-center text-base font-bold text-text">
                        {count}
                      </output>
                      <Button
                        variant="secondary"
                        onClick={() => count < limit && setCount(c.id, count + 1)}
                        aria-disabled={count >= limit}
                        className={stepClass}
                        aria-label={`Tambah ${c.name}`}
                      >
                        +
                      </Button>
                    </div>
                  ))}
              </div>
              {count > 0 && count >= limit && (
                <p className="text-sm text-muted">
                  Maksimal {limit} tiket {limit < c.maxPerOrder ? "(sisa kuota)" : "per pesanan"}.
                </p>
              )}
              {c.description && (
                <details className="group border-t border-border pt-3">
                  <summary className="cursor-pointer py-3 text-sm font-semibold text-text">Lihat deskripsi</summary>
                  <div className="rich-text pt-2 text-sm text-text" dangerouslySetInnerHTML={{ __html: c.description }} />
                </details>
              )}
            </li>
          );
        })}
      </ul>

      <aside className="lg:col-start-2 lg:row-start-1">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5 lg:sticky lg:top-6">
          <h2 className="text-lg font-bold text-text">Rincian Pesanan</h2>
          {chosen.length === 0 ? (
            <p className="text-sm text-muted">Belum ada tiket dipilih.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {chosen.map(({ category, count }) => (
                <li key={category.id} className="flex justify-between gap-3">
                  <span className="min-w-0 text-text">
                    {category.name} × {count}
                  </span>
                  <span className="shrink-0 font-semibold text-text">{formatRupiah(category.price * count)}</span>
                </li>
              ))}
            </ul>
          )}
          <dl className="flex flex-col gap-1 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Total item</dt>
              <dd className="font-semibold text-text">{units} tiket</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="text-lg font-extrabold text-text">{formatRupiah(subtotal)}</dd>
            </div>
          </dl>
          {buyError && <Alert>{buyError}</Alert>}
          {chosen.length > 0 && <TurnstileWidget ref={turnstile} siteKey={siteKey} onToken={setToken} />}
          <Button className="w-full" onClick={buy} loading={buying} disabled={chosen.length === 0 || !token} aria-describedby="buy-note">
            Beli Sekarang
          </Button>
          <p id="buy-note" className="text-sm text-muted">
            {chosen.length === 0 ? "Pilih tiket dulu." : "Slot tiket dikunci untuk Anda selama mengisi data pemesan."}
          </p>
        </div>
      </aside>
    </div>
  );
}
