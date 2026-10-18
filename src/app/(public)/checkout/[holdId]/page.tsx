import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getHoldView } from "@/lib/booking/hold-view";
import { getEnv } from "@/lib/env";
import { readVisitorId, VISITOR_COOKIE } from "@/lib/visitor";
import { CheckoutFlow } from "./checkout-flow";

export const metadata: Metadata = { title: "Detail pesanan", robots: { index: false, follow: false } };

async function Checkout({ params }: { params: Promise<{ holdId: string }> }) {
  const { holdId } = await params;
  const visitorId = readVisitorId((await cookies()).get(VISITOR_COOKIE)?.value);
  const view = visitorId ? await getHoldView(holdId, visitorId) : null;
  if (view?.orderUuid) redirect(`/orders/${view.orderUuid}`);
  if (!view) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 px-4 py-16">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">Pesanan tidak ditemukan.</h1>
        <p className="text-muted">Tautan ini mungkin dibuka dari perangkat lain atau slot tiketnya sudah dilepas.</p>
        <Link href="/events" className={buttonClass()}>
          Lihat event
        </Link>
      </div>
    );
  }
  return <CheckoutFlow view={view} siteKey={getEnv().TURNSTILE_SITE_KEY} />;
}

export default function CheckoutPage({ params }: PageProps<"/checkout/[holdId]">) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" className="relative mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:py-10">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
          <LoadingState label="Menyiapkan pesanan…" />
        </div>
      }
    >
      <Checkout params={params} />
    </Suspense>
  );
}
