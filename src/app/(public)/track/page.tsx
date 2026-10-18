import type { Metadata } from "next";
import { getEnv } from "@/lib/env";
import { TrackForm } from "./track-form";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Lacak Pesanan",
    description: "Cek status pembayaran dan e-ticket dengan kode pesanan dan email yang dipakai saat memesan.",
    alternates: { canonical: `${getEnv().APP_URL}/track` },
  };
}

export default function TrackPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10 lg:py-16">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl">Lacak Pesanan</h1>
        <p className="text-muted">Kode pesanan ada di email konfirmasi, diawali huruf A.</p>
      </div>
      <TrackForm />
    </div>
  );
}
