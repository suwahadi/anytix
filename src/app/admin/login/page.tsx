import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Login Panel", robots: { index: false, follow: false } };

export default function AdminLoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        <h1 className="text-center text-xl font-bold text-text">Login Panel</h1>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
