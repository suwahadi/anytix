import type { Metadata } from "next";
import { SettingsNav } from "../settings-nav";
import { SiteForm } from "./site-form";

export const metadata: Metadata = { title: "Pengaturan situs", robots: { index: false, follow: false } };

export default function SiteSettingsPage() {
  return (
    <>
      <SettingsNav active="site" />
      <SiteForm />
    </>
  );
}
