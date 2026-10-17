import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EventTabs } from "../event-tabs";
import { VoucherManager } from "./voucher-manager";

export const metadata: Metadata = { title: "Voucher", robots: { index: false, follow: false } };

export default function VouchersPage() {
  return (
    <Suspense fallback={<Skeleton className="mt-6 h-64" />}>
      <EventTabs active="vouchers" />
      <h1 className="mt-4 text-2xl font-bold text-text">Voucher</h1>
      <VoucherManager />
    </Suspense>
  );
}
