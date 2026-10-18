"use client";

import { useEffect, useState } from "react";
import { requestJson } from "@/lib/client-fetch";

/** Loads one settings group and saves it back through PUT /api/admin/settings/{group}. */
export function useSettings<T>(group: "transaction" | "site" | "smtp" | "email_templates" | "pages") {
  const [data, setData] = useState<T | null>(null);
  const [loadError, setLoadError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    requestJson<{ settings: T }>(`/api/admin/settings/${group}`).then((res) => {
      if (!active) return;
      if (res.ok) setData(res.data.settings);
      else setLoadError(res.error);
    });
    return () => {
      active = false;
    };
  }, [group]);

  async function save(body: unknown) {
    setSaving(true);
    setErrors({});
    setFormError("");
    setNotice("");
    const res = await requestJson<{ settings: T }>(`/api/admin/settings/${group}`, { method: "PUT", body });
    setSaving(false);
    if (!res.ok) {
      setErrors(res.fields ?? {});
      setFormError(res.error);
      return false;
    }
    setData(res.data.settings);
    setNotice("Pengaturan disimpan. Berlaku untuk pesanan baru.");
    return true;
  }

  return { data, setData, loadError, errors, formError, notice, saving, save };
}
