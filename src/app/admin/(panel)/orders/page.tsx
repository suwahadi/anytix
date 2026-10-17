import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { OrdersTable } from "./orders-table";

export const metadata: Metadata = { title: "Pesanan", robots: { index: false, follow: false } };

export default function OrdersPage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-text">Pesanan</h1>
      <Suspense fallback={<Skeleton className="mt-6 h-64" />}>
        <OrdersTable />
      </Suspense>
    </>
  );
}
