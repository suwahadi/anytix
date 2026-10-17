"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminEventRow } from "@/lib/catalog/event-service";
import type { CheckinHistoryItem } from "@/lib/checkin/checkin-service";
import { requestJson } from "@/lib/client-fetch";
import { Scanner } from "./scanner";

const GATE_KEY = "anytix:checkin-gate";
const PAGE_SIZE = 50;

const RESULT: Record<string, { label: string; tone: BadgeTone }> = {
  valid: { label: "Valid", tone: "success" },
  used: { label: "Sudah dipakai", tone: "warning" },
  wrong_event: { label: "Event lain", tone: "danger" },
  invalid: { label: "Tidak valid", tone: "danger" },
};

type Report = {
  stats: Array<{ category: string; issued: number; checkedIn: number }>;
  history: { items: CheckinHistoryItem[]; total: number };
};

function pickDefault(events: AdminEventRow[]): AdminEventRow | undefined {
  const now = Date.now();
  const upcoming = events.filter((e) => new Date(e.endsAt).getTime() >= now).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  return upcoming[0] ?? events[0];
}

export function CheckInConsole() {
  const [events, setEvents] = useState<AdminEventRow[] | null>(null);
  const [eventId, setEventId] = useState(0);
  const [gate, setGate] = useState("");
  const [gateError, setGateError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [audio, setAudio] = useState<AudioContext | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    requestJson<{ events: AdminEventRow[] }>("/api/admin/events?status=published").then((res) => {
      if (!active) return;
      try {
        setGate(localStorage.getItem(GATE_KEY) ?? "");
      } catch {}
      if (!res.ok) return setLoadError(res.error);
      setEvents(res.data.events);
      setEventId(pickDefault(res.data.events)?.id ?? 0);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (scanning || !eventId) return;
    let active = true;
    const q = new URLSearchParams({ eventId: String(eventId), page: String(page), ...(filter ? { result: filter } : {}) });
    requestJson<Report>(`/api/admin/check-ins/stats?${q}`).then((res) => {
      if (!active) return;
      if (res.ok) setReport(res.data);
      else setLoadError(res.error);
    });
    return () => {
      active = false;
    };
  }, [eventId, filter, page, scanning]);

  const event = events?.find((e) => e.id === eventId);

  function start(e: FormEvent) {
    e.preventDefault();
    const name = gate.trim();
    if (!name) return setGateError("Isi nama gate.");
    setGateError("");
    try {
      localStorage.setItem(GATE_KEY, name);
    } catch {}
    try {
      setAudio((a) => a ?? new AudioContext());
    } catch {}
    setScanning(true);
  }

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!events) return <Skeleton className="mt-6 h-64" />;
  if (events.length === 0) {
    return <p className="mt-6 rounded-lg border border-dashed border-border-strong p-6 text-center text-muted">Belum ada event yang terbit.</p>;
  }

  const time = (d: Date | string) =>
    new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "medium", timeZone: event?.timezone }).format(new Date(d));
  const pages = Math.max(1, Math.ceil((report?.history.total ?? 0) / PAGE_SIZE));
  const totals = report?.stats.reduce((s, r) => ({ issued: s.issued + r.issued, checkedIn: s.checkedIn + r.checkedIn }), { issued: 0, checkedIn: 0 });

  return (
    <div className="mt-6 flex flex-col gap-6">
      <form onSubmit={start} noValidate className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-start">
        <div className="sm:flex-1">
          <Select
            id="checkin-event"
            label="Event"
            value={String(eventId)}
            onChange={(e) => (setEventId(Number(e.target.value)), setPage(1))}
            options={events.map((e) => ({ value: String(e.id), label: e.title }))}
          />
        </div>
        <div className="sm:w-48">
          <Field id="checkin-gate" label="Nama gate" hint="Contoh: A, Utara" value={gate} error={gateError} maxLength={40} onChange={(e) => setGate(e.target.value)} />
        </div>
        <Button type="submit" className="sm:mt-[1.625rem]">
          Mulai scan
        </Button>
      </form>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-text">Kehadiran</h2>
          {totals && (
            <p className="text-sm text-muted">
              <span className="font-semibold text-text">{totals.checkedIn}</span> dari {totals.issued} tiket sudah masuk
            </p>
          )}
        </div>
        {!report ? (
          <Skeleton className="h-24" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full min-w-[28rem] text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-medium">Kategori tiket</th>
                  <th className="px-3 py-2 text-right font-medium">Tiket terbit</th>
                  <th className="px-3 py-2 text-right font-medium">Sudah masuk</th>
                  <th className="px-3 py-2 text-right font-medium">Persentase</th>
                </tr>
              </thead>
              <tbody>
                {report.stats.map((r) => (
                  <tr key={r.category} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-text">{r.category}</td>
                    <td className="px-3 py-2 text-right text-text">{r.issued}</td>
                    <td className="px-3 py-2 text-right font-semibold text-text">{r.checkedIn}</td>
                    <td className="px-3 py-2 text-right text-muted">{r.issued ? Math.round((r.checkedIn / r.issued) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-bold text-text">Riwayat scan</h2>
          <div className="w-48">
            <Select
              id="checkin-filter"
              label="Hasil"
              value={filter}
              onChange={(e) => (setFilter(e.target.value), setPage(1))}
              options={[
                { value: "", label: "Semua" },
                { value: "valid", label: "Valid" },
                { value: "used", label: "Sudah dipakai" },
                { value: "invalid", label: "Tidak valid" },
                { value: "wrong_event", label: "Event lain" },
              ]}
            />
          </div>
        </div>
        {report && report.history.items.length === 0 && (
          <p className="rounded-lg border border-dashed border-border-strong p-6 text-center text-muted">Belum ada scan.</p>
        )}
        {report && report.history.items.length > 0 && (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {report.history.items.map((h, i) => (
              <li key={`${h.at}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                <Badge tone={RESULT[h.result]?.tone}>{RESULT[h.result]?.label ?? h.result}</Badge>
                <span className="text-text">
                  {h.buyerName ? `${h.buyerName} · ${h.category} · Tiket ${h.seq}` : "Kode tidak dikenal"}
                </span>
                <span className="ml-auto text-muted">
                  {time(h.at)} · Gate {h.gate} · {h.adminEmail}
                </span>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Sebelumnya
            </Button>
            <span className="text-sm text-muted">
              Halaman {page} dari {pages}
            </span>
            <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Berikutnya
            </Button>
          </div>
        )}
      </section>

      {scanning && event && (
        <Scanner eventId={event.id} eventTitle={event.title} timezone={event.timezone} gate={gate.trim()} audio={audio} onClose={() => setScanning(false)} />
      )}
    </div>
  );
}
