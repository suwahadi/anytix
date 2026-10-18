import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { pageAdmin } from "@/lib/admin-page";
import { countLatePaid } from "@/lib/admin/order-admin-service";
import { getSalesSummary, type SalesSummary } from "@/lib/admin/sales-report";
import { formatDateTime, formatRupiah } from "@/lib/format";
import type { Timezone } from "@/lib/validation/catalog";

export const metadata: Metadata = { title: "Dasbor admin", robots: { index: false, follow: false } };

const SALE_STATUS: Record<string, string> = { on_sale: "Dijual", paused: "Dijeda", closed: "Ditutup" };

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

function EventSales({ e }: { e: SalesSummary }) {
  const figures = [
    ["Pendapatan bruto", formatRupiah(e.gross)],
    ["Diskon", formatRupiah(e.discount)],
    ["Biaya layanan", formatRupiah(e.fee)],
    ["Total diterima", formatRupiah(e.total)],
    ["Pesanan lunas", String(e.paidOrders)],
    ["Hold aktif", String(e.activeHolds)],
  ];
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-bold text-text">
          <Link href={`/admin/events/${e.eventId}`} className="hover:underline hover:underline-offset-4">
            {e.title}
          </Link>
        </h2>
        <p className="text-sm text-muted">
          {formatDateTime(new Date(e.startsAt), e.timezone as Timezone)} · {e.status === "published" ? (SALE_STATUS[e.saleStatus] ?? e.saleStatus) : "Draf"}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        {figures.map(([label, value], i) => (
          <div key={label}>
            <dt className="text-sm text-muted">{label}</dt>
            <dd className={i === 3 ? "text-lg font-extrabold text-accent-text" : "font-semibold text-text"}>{value}</dd>
          </div>
        ))}
      </dl>
      {e.categories.length > 0 && (
        <ul className="flex flex-col divide-y divide-border border-t border-border text-sm sm:hidden">
          {e.categories.map((c) => (
            <li key={c.name} className="flex flex-col gap-0.5 py-2.5">
              <span className="font-semibold text-text">{c.name}</span>
              <span className="text-muted">
                Terjual {c.sold} · Di-hold {c.held} · Tersedia {c.available} dari {c.capacity} · Check-in {c.checkedIn}
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
                <th className="px-3 py-2 text-right font-medium">Kuota</th>
                <th className="px-3 py-2 text-right font-medium">Terjual</th>
                <th className="px-3 py-2 text-right font-medium">Di-hold</th>
                <th className="px-3 py-2 text-right font-medium">Tersedia</th>
                <th className="py-2 pl-3 text-right font-medium">Check-in</th>
              </tr>
            </thead>
            <tbody>
              {e.categories.map((c) => (
                <tr key={c.name} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3 text-text">{c.name}</td>
                  <td className="px-3 py-2 text-right text-muted">{c.capacity}</td>
                  <td className="px-3 py-2 text-right font-semibold text-text">{c.sold}</td>
                  <td className="px-3 py-2 text-right text-text">{c.held}</td>
                  <td className="px-3 py-2 text-right text-text">{c.available}</td>
                  <td className="py-2 pl-3 text-right text-text">{c.checkedIn}</td>
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
      <h1 className="text-2xl font-bold text-text">Dasbor</h1>
      <Suspense fallback={null}>
        <LatePaidBanner />
      </Suspense>
      <Suspense fallback={<Skeleton className="mt-6 h-64" />}>
        <SalesOverview />
      </Suspense>
    </>
  );
}
