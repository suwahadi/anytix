import type { Metadata } from "next";
import { ContentNav } from "../content-nav";
import { FaqManager } from "./faq-manager";

export const metadata: Metadata = { title: "Konten: FAQ", robots: { index: false, follow: false } };

export default function ContentFaqPage() {
  return (
    <>
      <ContentNav active="faq" />
      <FaqManager />
    </>
  );
}
