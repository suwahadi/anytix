import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminBar, AdminBarFallback } from "./admin-bar";

export const metadata: Metadata = { title: "Dasbor admin", robots: { index: false, follow: false } };

export default function AdminHomePage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <Suspense fallback={<AdminBarFallback />}>
        <AdminBar />
      </Suspense>
      <h1 className="mt-8 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Dasbor</h1>
      <p className="mt-2 max-w-prose text-zinc-700 dark:text-zinc-300">
        Modul event, kategori tiket, dan pesanan belum tersedia di panel ini. Untuk sekarang Anda bisa mengatur
        verifikasi dua langkah di halaman{" "}
        <Link href="/admin/security" className="font-medium underline underline-offset-4">
          Keamanan
        </Link>
        .
      </p>
    </main>
  );
}
