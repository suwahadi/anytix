import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderDetail } from "./order-detail";

export const metadata: Metadata = { title: "Detail pesanan", robots: { index: false, follow: false } };

export default function AdminOrderPage() {
  return (
    <Suspense fallback={<Skeleton className="mt-6 h-96" />}>
      <OrderDetail />
    </Suspense>
  );
}
