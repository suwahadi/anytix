import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-16">
      <p className="text-sm font-semibold text-muted">404</p>
      <h1 className="text-2xl font-extrabold tracking-tight text-text">Halaman tidak ditemukan</h1>
      <p className="text-muted">Event ini mungkin sudah tidak tersedia, atau alamatnya salah ketik.</p>
      <Link href="/events" className={buttonClass()}>
        Lihat event lain
      </Link>
    </main>
  );
}
