import type { Metadata } from "next";
import { PasswordForm } from "./password-form";
import { TwoFactorPanel } from "./two-factor-panel";

export const metadata: Metadata = { title: "Keamanan akun", robots: { index: false, follow: false } };

export default function SecurityPage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-text">Keamanan akun</h1>
      <TwoFactorPanel />
      <PasswordForm />
    </>
  );
}
