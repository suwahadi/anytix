"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminEventRow } from "@/lib/catalog/event-service";
import { requestJson } from "@/lib/client-fetch";
import { TIMEZONES } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import type { Timezone } from "@/lib/validation/catalog";

export const STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draf", tone: "muted" },
  published: { label: "Terbit", tone: "success" },
  archived: { label: "Arsip", tone: "muted" },
};

export const SALE_LABELS: Record<string, string> = { on_sale: "Penjualan dibuka", paused: "Penjualan dijeda", closed: "Penjualan ditutup" };

export function formatAdminSchedule(startsAt: string | Date, timezone: string) {
  const tz = timezone as Timezone;
  const text = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(
    new Date(startsAt),
  );
  return `${text} ${TIMEZONES[tz]?.label ?? ""}`.trim();
}

export function EventsTable() {
  const [events, setEvents] = useState<AdminEventRow[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function load(query = q, filter = status) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (filter) params.set("status", filter);
    const res = await requestJson<{ events: AdminEventRow[] }>(`/api/admin/events?${params}`);
    setLoading(false);
    if (res.ok) setEvents(res.data.events);
    else setError(res.error);
  }

  useEffect(() => {
    let active = true;
    requestJson<{ events: AdminEventRow[] }>("/api/admin/events").then((res) => {
      if (!active) return;
      if (res.ok) setEvents(res.data.events);
      else setError(res.error);
    });
    return () => {
      active = false;
    };
  }, []);

  function search(e: FormEvent) {
    e.preventDefault();
    load();
  }

  const filtered = q.trim() !== "" || status !== "";

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form onSubmit={search} className="flex flex-wrap items-end gap-2" role="search">
          <div className="w-64 max-w-full">
            <Field id="event-search" label="Cari judul, kota, atau slug" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="w-40">
            <Select
              id="event-status"
              label="Status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                load(q, e.target.value);
              }}
              options={[
                { value: "", label: "Semua" },
                { value: "draft", label: "Draf" },
                { value: "published", label: "Terbit" },
                { value: "archived", label: "Arsip" },
              ]}
            />
          </div>
          <Button type="submit" variant="secondary" loading={loading}>
            Cari
          </Button>
        </form>
        <Link href="/admin/events/new" className={buttonClass()}>
          Buat event
        </Link>
      </div>

      {error && (
        <div className="flex flex-col items-start gap-3">
          <Alert>{error}</Alert>
          <Button variant="secondary" onClick={() => load()}>
            Muat ulang
          </Button>
        </div>
      )}

      {!events && !error && (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Memuat event">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}

      {events?.length === 0 && (
        <div className="rounded-lg border border-dashed border-border-strong p-6 text-center text-muted">
          {filtered ? (
            <>
              Tidak ada event yang cocok.{" "}
              <button
                type="button"
                className="font-medium text-accent-text underline underline-offset-4"
                onClick={() => (setQ(""), setStatus(""), load("", ""))}
              >
                Hapus filter
              </button>
            </>
          ) : (
            "Belum ada event. Buat event pertama Anda."
          )}
        </div>
      )}

      {events && events.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={`/admin/events/${e.id}`}
                className="flex items-center gap-3 px-3 py-3 hover:bg-surface-muted focus-visible:outline-offset-[-2px]"
              >
                {e.posterPath ? (
                  <Image
                    src={mediaUrl(e.posterPath, "thumb")}
                    alt=""
                    width={96}
                    height={54}
                    unoptimized
                    className="hidden h-14 w-24 shrink-0 rounded-md bg-surface-muted object-cover sm:block"
                  />
                ) : (
                  <span aria-hidden className="hidden h-14 w-24 shrink-0 rounded-md bg-surface-muted sm:block" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-semibold text-text">
                    {e.title}
                    <Badge tone={STATUS_LABELS[e.status]?.tone}>{STATUS_LABELS[e.status]?.label ?? e.status}</Badge>
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {formatAdminSchedule(e.startsAt, e.timezone)} · {e.categoryName}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {SALE_LABELS[e.saleStatus]} · {e.ticketCategoryCount} kategori tiket
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
