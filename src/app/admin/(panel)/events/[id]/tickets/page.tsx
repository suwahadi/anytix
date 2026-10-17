import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EventTabs } from "../event-tabs";
import { TicketCategoryManager } from "./ticket-category-manager";

export const metadata: Metadata = { title: "Kategori tiket", robots: { index: false, follow: false } };

export default function TicketCategoriesPage() {
  return (
    <Suspense fallback={<Skeleton className="mt-6 h-64" />}>
      <EventTabs active="tickets" />
      <h1 className="mt-4 text-2xl font-bold text-text">Kategori tiket</h1>
      <TicketCategoryManager />
    </Suspense>
  );
}
