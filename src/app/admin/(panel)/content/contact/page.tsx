import type { Metadata } from "next";
import { ContentNav } from "../content-nav";
import { PageForm } from "../page-form";

export const metadata: Metadata = { title: "Konten: Hubungi Kami", robots: { index: false, follow: false } };

export default function ContentContactPage() {
  return (
    <>
      <ContentNav active="contact" />
      <PageForm page="contact" />
    </>
  );
}
