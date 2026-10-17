import { Suspense } from "react";
import { AdminBar, AdminBarFallback } from "./admin-bar";

export default function AdminPanelLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <Suspense fallback={<AdminBarFallback />}>
        <AdminBar />
      </Suspense>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
