import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: { default: "Anytix", template: "%s · Anytix" },
  description: "Beli tiket event tanpa perlu daftar akun.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" suppressHydrationWarning className={`${jakarta.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg font-sans text-text">{children}</body>
    </html>
  );
}
