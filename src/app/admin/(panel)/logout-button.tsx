"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoutIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { requestJson } from "@/lib/client-fetch";

/** `inMenu` renders it as the last row of the mobile menu, left-aligned like the links above it. */
export function LogoutButton({ inMenu = false }: { inMenu?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await requestJson("/api/admin/auth/logout", { body: {} });
    router.replace("/admin/login");
    router.refresh();
  }

  if (inMenu) {
    return (
      <button
        type="button"
        onClick={logout}
        disabled={loading}
        aria-busy={loading || undefined}
        className="flex min-h-11 w-full items-center gap-2 rounded-md px-2.5 text-sm font-semibold text-danger hover:bg-danger-soft disabled:opacity-60"
      >
        {loading ? <Spinner /> : <LogoutIcon className="size-[18px]" />}
        Keluar
      </button>
    );
  }

  return (
    <Button variant="ghostDanger" loading={loading} onClick={logout}>
      {!loading && <LogoutIcon className="size-[18px]" />}
      Keluar
    </Button>
  );
}
