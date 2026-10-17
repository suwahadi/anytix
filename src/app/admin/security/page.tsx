import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminBar, AdminBarFallback } from "../admin-bar";
import { TwoFactorPanel } from "./two-factor-panel";

export const metadata: Metadata = { title: "Keamanan akun", robots: { index: false, follow: false } };

export default function SecurityPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <Suspense fallback={<AdminBarFallback />}>
        <AdminBar />
      </Suspense>
      <h1 className="mt-8 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Keamanan akun</h1>
      <TwoFactorPanel />
    </main>
  );
}
