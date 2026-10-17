import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Dasbor admin", robots: { index: false, follow: false } };

export default function AdminHomePage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-text">Dasbor</h1>
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
