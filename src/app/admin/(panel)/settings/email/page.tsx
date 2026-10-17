import type { Metadata } from "next";
import { SettingsNav } from "../settings-nav";
import { EmailForm } from "./email-form";

export const metadata: Metadata = { title: "Pengaturan email", robots: { index: false, follow: false } };

export default function EmailSettingsPage() {
  return (
    <>
      <SettingsNav active="email" />
      <EmailForm />
    </>
  );
}
