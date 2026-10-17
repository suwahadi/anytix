import type { Metadata } from "next";
import { SettingsNav } from "./settings-nav";
import { TransactionForm } from "./transaction-form";

export const metadata: Metadata = { title: "Pengaturan transaksi", robots: { index: false, follow: false } };

export default function TransactionSettingsPage() {
  return (
    <>
      <SettingsNav active="transaction" />
      <TransactionForm />
    </>
  );
}
