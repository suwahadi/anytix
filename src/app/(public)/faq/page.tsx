import type { Metadata } from "next";
import Link from "next/link";
import { FaqAccordion } from "@/components/faq-accordion";
import { getPublicFaqs } from "@/lib/public/catalog-queries";

export const metadata: Metadata = { title: "FAQ", description: "Jawaban untuk pertanyaan yang paling sering diajukan pembeli tiket." };

export default async function FaqPage() {
  const faqs = await getPublicFaqs();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl">Pertanyaan yang Sering Diajukan</h1>
        <p className="text-muted">
          Tidak menemukan jawabannya?{" "}
          <Link href="/contact" className="font-semibold text-accent-text underline underline-offset-4">
            Hubungi kami
          </Link>
          .
        </p>
      </div>
      {faqs.length > 0 ? (
        <FaqAccordion items={faqs} />
      ) : (
        <p className="rounded-lg border border-dashed border-border-strong px-4 py-10 text-center text-muted">Belum ada pertanyaan yang ditampilkan.</p>
      )}
    </div>
  );
}
