import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "Halaman tidak ditemukan" };

export function NotFoundBody() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-start justify-center gap-4 px-4 py-16">
      <p className="text-sm font-semibold text-muted">404</p>
      <h1 className="text-2xl font-extrabold tracking-tight text-text">Halaman tidak ditemukan</h1>
      <p className="text-muted">Alamatnya mungkin salah ketik, atau halamannya sudah tidak tersedia.</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/events" className={buttonClass()}>
          Jelajah event
        </Link>
        <Link href="/" className={buttonClass("secondary")}>
          Ke beranda
        </Link>
      </div>
    </div>
  );
}

export default NotFoundBody;
