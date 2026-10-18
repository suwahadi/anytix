"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { DownloadIcon, SearchIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminOrderRow } from "@/lib/admin/order-admin-service";
import { requestJson } from "@/lib/client-fetch";
import { formatRupiah } from "@/lib/format";
import { formatAdminTime, ORDER_STATUS } from "./order-labels";

type ListResult = { items: AdminOrderRow[]; total: number; pageSize: number };
type Filter = { q: string; status: string; eventId: string; page: number };

const STATUS_OPTIONS = [{ value: "", label: "Semua status" }, ...Object.entries(ORDER_STATUS).map(([value, s]) => ({ value, label: s.label }))];

function filterFrom(params: URLSearchParams): Filter {
  return { q: params.get("q") ?? "", status: params.get("status") ?? "", eventId: params.get("eventId") ?? "", page: Math.max(1, Number(params.get("page")) || 1) };
}

function queryOf(f: Filter): URLSearchParams {
  const qs = new URLSearchParams();
  if (f.q.trim()) qs.set("q", f.q.trim());
  if (f.status) qs.set("status", f.status);
  if (f.eventId) qs.set("eventId", f.eventId);
  if (f.page > 1) qs.set("page", String(f.page));
  return qs;
}

export function OrdersTable() {
  const params = useSearchParams();
  const [initial] = useState(() => filterFrom(new URLSearchParams(params)));
  const [filter, setFilter] = useState<Filter>(initial);
  const [result, setResult] = useState<ListResult | null>(null);
  const [events, setEvents] = useState<Array<{ id: number; title: string }>>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load(next: Filter) {
    setFilter(next);
    setLoading(true);
    setError("");
    const qs = queryOf(next);
    window.history.replaceState(null, "", qs.size > 0 ? `?${qs}` : window.location.pathname);
    const res = await requestJson<ListResult>(`/api/admin/orders?${qs}`);
    setLoading(false);
    if (res.ok) setResult(res.data);
    else setError(res.error);
  }

  useEffect(() => {
    let active = true;
    Promise.all([requestJson<ListResult>(`/api/admin/orders?${queryOf(initial)}`), requestJson<{ events: Array<{ id: number; title: string }> }>("/api/admin/events")]).then(
      ([orders, ev]) => {
        if (!active) return;
        if (orders.ok) setResult(orders.data);
        else setError(orders.error);
        if (ev.ok) setEvents(ev.data.events);
      },
    );
    return () => {
      active = false;
    };
  }, [initial]);

  function search(e: FormEvent) {
    e.preventDefault();
    load({ ...filter, page: 1 });
  }

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const filtered = filter.q.trim() !== "" || filter.status !== "" || filter.eventId !== "";

  return (
    <div className="mt-6 flex flex-col gap-4">
      <form
        onSubmit={search}
        role="search"
        className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_11rem_14rem_auto] lg:items-end"
      >
        <div className="min-w-0 sm:col-span-2 lg:col-span-1">
          <Field id="order-search" label="Cari invoice, email, nama, atau UUID" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        </div>
        <div className="min-w-0">
          <Select id="order-status" label="Status" value={filter.status} options={STATUS_OPTIONS} onChange={(e) => load({ ...filter, status: e.target.value, page: 1 })} />
        </div>
        <div className="min-w-0">
          <Select
            id="order-event"
            label="Event"
            value={filter.eventId}
            options={[{ value: "", label: "Semua event" }, ...events.map((e) => ({ value: String(e.id), label: e.title }))]}
            onChange={(e) => load({ ...filter, eventId: e.target.value, page: 1 })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1 lg:flex">
          <Button type="submit" loading={loading}>
            {!loading && <SearchIcon className="size-[18px]" />}
            Cari
          </Button>
          <a
            href={`/api/admin/reports/sales.csv?${new URLSearchParams({ ...(filter.status && { status: filter.status }), ...(filter.eventId && { eventId: filter.eventId }) })}`}
            download
            className={buttonClass("secondary")}
            title={filter.eventId ? "Termasuk jawaban form event ini. Nomor identitas disamarkan." : "Pilih satu event untuk menyertakan jawaban form. Nomor identitas disamarkan."}
          >
            <DownloadIcon className="size-[18px]" />
            Ekspor CSV
          </a>
        </div>
      </form>

      {error && (
        <div className="flex flex-col items-start gap-3">
          <Alert>{error}</Alert>
          <Button variant="secondary" onClick={() => load(filter)}>
            Muat ulang
          </Button>
        </div>
      )}

      {!result && !error && (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Memuat pesanan">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      )}

      {result?.items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border-strong p-6 text-center text-muted">
          {filtered ? (
            <>
              Tidak ada pesanan yang cocok.{" "}
              <button
                type="button"
                className="inline-flex min-h-11 items-center font-medium text-accent-text underline underline-offset-4"
                onClick={() => load({ q: "", status: "", eventId: "", page: 1 })}
              >
                Hapus filter
              </button>
            </>
          ) : (
            "Belum ada pesanan. Pesanan muncul di sini setelah pembeli menekan Bayar Sekarang."
          )}
        </div>
      )}

      {result && result.items.length > 0 && (
        <>
          <p className="text-sm text-muted" aria-live="polite">
            {result.total} pesanan{pages > 1 && ` · halaman ${filter.page} dari ${pages}`}
          </p>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {result.items.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-3 hover:bg-surface-muted focus-visible:outline-offset-[-2px]">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-semibold text-text">
                      {o.invoice}
                      <Badge tone={ORDER_STATUS[o.status]?.tone}>{ORDER_STATUS[o.status]?.label ?? o.status}</Badge>
                    </span>
                    <span className="mt-0.5 block break-all text-sm text-muted">
                      {o.buyerName} · {o.buyerEmail}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted">
                      {o.eventTitle} · {formatAdminTime(o.createdAt)}
                    </span>
                  </span>
                  <span className="font-semibold text-text">{formatRupiah(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="Halaman" className="flex items-center justify-between gap-4">
              <Button variant="secondary" disabled={filter.page <= 1} onClick={() => load({ ...filter, page: filter.page - 1 })}>
                Sebelumnya
              </Button>
              <Button variant="secondary" disabled={filter.page >= pages} onClick={() => load({ ...filter, page: filter.page + 1 })}>
                Berikutnya
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
