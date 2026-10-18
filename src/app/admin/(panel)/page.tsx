import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarIcon } from "@/components/icons";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { pageAdmin } from "@/lib/admin-page";
import { countLatePaid } from "@/lib/admin/order-admin-service";
import { getSalesSummary, type SalesSummary } from "@/lib/admin/sales-report";
import { formatDateTime, formatRupiah } from "@/lib/format";
import type { Timezone } from "@/lib/validation/catalog";

export const metadata: Metadata = { title: "Dasbor admin", robots: { index: false, follow: false } };

const SALE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  on_sale: { label: "Dijual", tone: "success" },
  paused: { label: "Dijeda", tone: "warning" },
  closed: { label: "Ditutup", tone: "muted" },
};

async function LatePaidBanner() {
  await pageAdmin();
  const n = await countLatePaid();
  if (n === 0) return null;
  return (
    <p role="status" className="mt-4 rounded-md border border-warning bg-warning-soft px-4 py-3 text-sm text-text">
      {n} pesanan perlu tindak lanjut karena pembayaran terlambat.{" "}
      <Link href="/admin/orders?status=late_paid_review" className="font-semibold text-accent-text underline underline-offset-4">
        Lihat pesanan
      </Link>
    </p>
  );
}

function SoldBar({ sold, held, capacity }: { sold: number; held: number; capacity: number }) {
  const pct = (n: number) => (capacity > 0 ? Math.min(100, (n / capacity) * 100) : 0);
  return (
    <div aria-hidden className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
      <span className="bg-accent" style={{ width: `${pct(sold)}%` }} />
      <span className="bg-warning" style={{ width: `${pct(held)}%` }} />
    </div>
  );
}

function EventSales({ e }: { e: SalesSummary }) {
  const status = e.status === "published" ? (SALE_STATUS[e.saleStatus] ?? { label: e.saleStatus, tone: "muted" as const }) : { label: "Draf", tone: "muted" as const };
  const breakdown = [
    ["Pendapatan bruto", formatRupiah(e.gross)],
    ["Diskon", formatRupiah(e.discount)],
    ["Biaya layanan", formatRupiah(e.fee)],
    ["Hold aktif", String(e.activeHolds)],
  ];
  return (
    <section className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-lg font-bold leading-snug text-text">
            <Link href={`/admin/events/${e.eventId}`} className="hover:underline hover:underline-offset-4">
              {e.title}
            </Link>
          </h2>
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <CalendarIcon className="size-4 shrink-0" />
            {formatDateTime(new Date(e.startsAt), e.timezone as Timezone)}
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <dl className="grid grid-cols-2 gap-4 rounded-lg bg-accent-soft p-4 lg:grid-cols-1">
          <div>
            <dt className="text-sm text-muted">Total diterima</dt>
            <dd className="text-2xl font-extrabold tabular-nums text-accent-text">{formatRupiah(e.total)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Pesanan lunas</dt>
            <dd className="text-2xl font-extrabold tabular-nums text-text">{e.paidOrders}</dd>
          </div>
        </dl>
        <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-border sm:grid-cols-4">
          {breakdown.map(([label, value]) => (
            <div key={label} className="flex flex-col justify-center gap-0.5 border-border p-3 [&:nth-child(odd)]:border-r max-sm:[&:nth-child(-n+2)]:border-b sm:border-r sm:last:border-r-0">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="font-semibold tabular-nums text-text">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {e.categories.length > 0 && (
        <ul className="flex flex-col divide-y divide-border border-t border-border text-sm sm:hidden">
          {e.categories.map((c) => (
            <li key={c.name} className="flex flex-col gap-1.5 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-text">{c.name}</span>
                <span className="shrink-0 tabular-nums text-muted">
                  {c.sold}/{c.capacity}
                </span>
              </div>
              <SoldBar sold={c.sold} held={c.held} capacity={c.capacity} />
              <span className="text-xs text-muted">
                Di-hold {c.held} · Tersedia {c.available} · Check-in {c.checkedIn}
              </span>
            </li>
          ))}
        </ul>
      )}
      {e.categories.length > 0 && (
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Kategori tiket</th>
                <th className="w-40 px-3 py-2 font-medium">Terjual</th>
                <th className="px-3 py-2 text-right font-medium">Di-hold</th>
                <th className="px-3 py-2 text-right font-medium">Tersedia</th>
                <th className="py-2 pl-3 text-right font-medium">Check-in</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {e.categories.map((c) => (
                <tr key={c.name} className="border-b border-border last:border-0">
                  <td className="py-2.5 pr-3 font-medium text-text">{c.name}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-1">
                      <span className="text-text">
                        <span className="font-semibold">{c.sold}</span>
                        <span className="text-muted"> / {c.capacity}</span>
                      </span>
                      <SoldBar sold={c.sold} held={c.held} capacity={c.capacity} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-text">{c.held}</td>
                  <td className="px-3 py-2.5 text-right text-text">{c.available}</td>
                  <td className="py-2.5 pl-3 text-right text-text">{c.checkedIn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

async function SalesOverview() {
  await pageAdmin();
  const events = await getSalesSummary();
  if (events.length === 0) {
    return (
      <p className="mt-6 rounded-lg border border-dashed border-border-strong p-6 text-center text-muted">
        Belum ada event.{" "}
        <Link href="/admin/events/new" className="font-semibold text-accent-text underline underline-offset-4">
          Buat event
        </Link>
      </p>
    );
  }
  return (
    <div className="mt-6 flex flex-col gap-4">
      {events.map((e) => (
        <EventSales key={e.eventId} e={e} />
      ))}
    </div>
  );
}

export default function AdminHomePage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text">Dasbor</h1>
        <p className="text-sm text-muted">Penjualan dan kuota tiket per event.</p>
      </div>
      <Suspense fallback={null}>
        <LatePaidBanner />
      </Suspense>
      <Suspense fallback={<Skeleton className="mt-6 h-64" />}>
        <SalesOverview />
      </Suspense>
    </>
  );
}
