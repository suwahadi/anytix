"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestJson } from "@/lib/client-fetch";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await requestJson("/api/admin/auth/logout", { body: {} });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <Button variant="secondary" loading={loading} onClick={logout}>
      Keluar
    </Button>
  );
}
