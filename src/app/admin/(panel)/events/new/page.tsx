import type { Metadata } from "next";
import Link from "next/link";
import { EventForm } from "../event-form";

export const metadata: Metadata = { title: "Buat event", robots: { index: false, follow: false } };

export default function NewEventPage() {
  return (
    <>
      <Link href="/admin/events" className="text-sm font-medium text-accent-text underline underline-offset-4">
        Kembali ke daftar event
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-text">Buat event</h1>
      <p className="mt-1 text-muted">Event tersimpan sebagai draf dulu. Kategori tiket ditambahkan setelah event dibuat.</p>
      <EventForm />
    </>
  );
}
