import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { countLatePaid } from "@/lib/admin/order-admin-service";

export const metadata: Metadata = { title: "Dasbor admin", robots: { index: false, follow: false } };

async function LatePaidBanner() {
  const n = await countLatePaid();
  if (n === 0) return null;
  return (
    <p role="status" className="mt-4 rounded-md border border-warning bg-warning-soft px-4 py-3 text-sm text-text">
      {n} pesanan perlu tindak lanjut karena pembayaran terlambat.{" "}
      <Link href="/admin/orders?status=late_paid_review" className="font-semibold text-accent-text underline underline-offset-4">
        Lihat pesanan
      </Link>
    </p>
  );
}

export default function AdminHomePage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-text">Dasbor</h1>
      <Suspense fallback={null}>
        <LatePaidBanner />
      </Suspense>
      <p className="mt-2 max-w-prose text-muted">
        Statistik penjualan hadir setelah pembayaran aktif. Untuk sekarang Anda bisa mengatur verifikasi dua langkah di
        halaman{" "}
        <Link href="/admin/security" className="font-medium text-accent-text underline underline-offset-4">
          Keamanan
        </Link>
        .
      </p>
    </>
  );
}
