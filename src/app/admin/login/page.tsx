import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk admin", robots: { index: false, follow: false } };

export default function AdminLoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        <h1 className="text-xl font-bold text-text">Masuk ke panel admin</h1>
        <p className="mt-1 text-sm text-muted">Kelola event, tiket, dan pesanan Anytix.</p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
