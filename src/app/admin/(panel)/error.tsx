"use client";

import { Button } from "@/components/ui/button";

export default function AdminError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div role="alert" className="flex max-w-xl flex-col items-start gap-4 py-10">
      <h1 className="text-2xl font-bold text-text">Halaman gagal dimuat</h1>
      <p className="text-muted">Ada gangguan saat mengambil data. Coba lagi, atau muat ulang halaman bila masih gagal.</p>
      <Button onClick={() => retry()}>Coba lagi</Button>
    </div>
  );
}
