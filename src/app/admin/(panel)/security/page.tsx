import type { Metadata } from "next";
import { Suspense } from "react";
import { pageAdmin } from "@/lib/admin-page";
import { PasswordForm } from "./password-form";
import { TwoFactorPanel } from "./two-factor-panel";

export const metadata: Metadata = { title: "Keamanan akun", robots: { index: false, follow: false } };

async function SignedInAs() {
  const admin = await pageAdmin();
  return (
    <p className="mt-2 break-all text-muted">
      Masuk sebagai <span className="font-semibold text-text">{admin.email}</span>
    </p>
  );
}

export default function SecurityPage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-text">Keamanan akun</h1>
      <Suspense fallback={null}>
        <SignedInAs />
      </Suspense>
      <TwoFactorPanel />
      <PasswordForm />
    </>
  );
}
