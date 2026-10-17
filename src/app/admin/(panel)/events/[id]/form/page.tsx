import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EventTabs } from "../event-tabs";
import { FormBuilder } from "./form-builder";

export const metadata: Metadata = { title: "Form pemesan", robots: { index: false, follow: false } };

export default function FormFieldsPage() {
  return (
    <Suspense fallback={<Skeleton className="mt-6 h-64" />}>
      <EventTabs active="form" />
      <h1 className="mt-4 text-2xl font-bold text-text">Form pemesan</h1>
      <FormBuilder />
    </Suspense>
  );
}
