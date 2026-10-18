import type { Metadata } from "next";
import { FaqAccordion } from "@/components/faq-accordion";
import { getPublicFaqs } from "@/lib/public/catalog-queries";

export const metadata: Metadata = { title: "FAQ", description: "Jawaban untuk pertanyaan yang paling sering diajukan pembeli tiket." };

export default async function FaqPage() {
  const faqs = await getPublicFaqs();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:py-10">
      <h1 className="text-center text-2xl font-extrabold tracking-tight text-text sm:text-3xl">Pertanyaan yang Sering Diajukan</h1>
      {faqs.length > 0 ? (
        <FaqAccordion items={faqs} />
      ) : (
        <p className="rounded-lg border border-dashed border-border-strong px-4 py-10 text-center text-muted">Belum ada pertanyaan yang ditampilkan.</p>
      )}
    </div>
  );
}
