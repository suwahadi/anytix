import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { getEnv } from "@/lib/env";
import { getPublicSite } from "@/lib/public/catalog-queries";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
});

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getPublicSite();
  const description = "Beli tiket event tanpa perlu daftar akun.";
  return {
    metadataBase: new URL(getEnv().APP_URL),
    title: { default: name, template: `%s · ${name}` },
    description,
    openGraph: {
      siteName: name,
      locale: "id_ID",
      type: "website",
      description,
      images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: name }],
    },
    twitter: { card: "summary" },
  };
}

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
