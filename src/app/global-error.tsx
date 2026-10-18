"use client";

import "./globals.css";

/** Replaces the root layout when it fails, so it brings its own document; the theme falls back to the OS setting. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="id">
      <body className="flex min-h-full flex-col bg-bg font-sans text-text antialiased">
        <title>Halaman gagal dimuat</title>
        <main role="alert" className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-16">
          <h1 className="text-2xl font-extrabold tracking-tight">Halaman gagal dimuat</h1>
          <p className="text-muted">Ada gangguan di server. Coba lagi sebentar.</p>
          <button type="button" onClick={() => retry()} className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 font-semibold text-on-accent hover:bg-accent-hover">
            Coba lagi
          </button>
        </main>
      </body>
    </html>
  );
}
