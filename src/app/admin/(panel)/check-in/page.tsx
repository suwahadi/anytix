import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckInConsole } from "./check-in-console";

export const metadata: Metadata = {
  title: "Check-in",
  robots: { index: false, follow: false },
  manifest: "/checkin.webmanifest",
  appleWebApp: { capable: true, title: "Check-in", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export default function CheckInPage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-text">Check-in</h1>
      <Suspense fallback={<Skeleton className="mt-6 h-64" />}>
        <CheckInConsole />
      </Suspense>
    </>
  );
}
