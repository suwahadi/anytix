import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getOrderView } from "@/lib/booking/order-view";
import { getPublicSite } from "@/lib/public/catalog-queries";
import { OrderStatus } from "./order-status";

export const metadata: Metadata = { title: "Pesanan", robots: { index: false, follow: false }, referrer: "no-referrer" };

async function Order({ params }: { params: Promise<{ uuid: string }> }) {
  const [view, site] = await Promise.all([getOrderView((await params).uuid), getPublicSite()]);
  if (!view) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 px-4 py-16">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">Pesanan tidak ditemukan.</h1>
        <p className="text-muted">Periksa kembali tautan dari email Anda.</p>
        <Link href="/events" className={buttonClass()}>
          Lihat event
        </Link>
      </div>
    );
  }
  return <OrderStatus initial={view} cs={{ whatsapp: site.csWhatsapp, email: site.csEmail }} />;
}

export default function OrderPage({ params }: PageProps<"/orders/[uuid]">) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" aria-label="Memuat pesanan" className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 lg:py-10">
          <Skeleton className="h-24" />
          <Skeleton className="h-72" />
        </div>
      }
    >
      <Order params={params} />
    </Suspense>
  );
}
