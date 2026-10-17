import type { Metadata } from "next";
import { CategoryManager } from "./category-manager";

export const metadata: Metadata = { title: "Kategori event", robots: { index: false, follow: false } };

export default function EventCategoriesPage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-text">Kategori event</h1>
      <CategoryManager />
    </>
  );
}
