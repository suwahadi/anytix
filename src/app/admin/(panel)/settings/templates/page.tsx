import type { Metadata } from "next";
import { SettingsNav } from "../settings-nav";
import { TemplatesForm } from "./templates-form";

export const metadata: Metadata = { title: "Templat email", robots: { index: false, follow: false } };

export default function EmailTemplatesPage() {
  return (
    <>
      <SettingsNav active="templates" />
      <TemplatesForm />
    </>
  );
}
