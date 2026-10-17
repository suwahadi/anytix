"use client";

import { Button } from "@/components/ui/button";

export default function PublicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 px-4 py-16">
      <h1 className="text-2xl font-extrabold tracking-tight text-text">Halaman gagal dimuat</h1>
      <p className="text-muted">Ada gangguan saat mengambil data. Coba lagi sebentar.</p>
      <Button onClick={reset}>Coba lagi</Button>
    </div>
  );
}
