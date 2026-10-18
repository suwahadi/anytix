import type { Metadata } from "next";
import { ContentNav } from "./content-nav";
import { PageForm } from "./page-form";

export const metadata: Metadata = { title: "Konten: Tentang Kami", robots: { index: false, follow: false } };

export default function ContentAboutPage() {
  return (
    <>
      <ContentNav active="about" />
      <PageForm page="about" />
    </>
  );
}
