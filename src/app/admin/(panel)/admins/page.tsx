import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminManager } from "./admin-manager";
import { AdminTabs } from "./admin-tabs";

export const metadata: Metadata = { title: "Akun admin", robots: { index: false, follow: false } };

export default function AdminsPage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-text">Admin &amp; Audit</h1>
      <AdminTabs active="admins" />
      <Suspense fallback={<Skeleton className="mt-6 h-48" />}>
        <AdminManager />
      </Suspense>
    </>
  );
}
