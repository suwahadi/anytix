import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EditEvent } from "./edit-event";

export const metadata: Metadata = { title: "Detail event", robots: { index: false, follow: false } };

export default function EditEventPage() {
  return (
    <Suspense fallback={<Skeleton className="mt-6 h-64" />}>
      <EditEvent />
    </Suspense>
  );
}
