"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { requestJson } from "@/lib/client-fetch";

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setError("");
    setNotice("");
    const res = await requestJson("/api/admin/auth/password", { body: { current, next } });
    setSaving(false);
    if (!res.ok) {
      setErrors(res.fields ?? {});
      return setError(res.fields ? "" : res.error);
    }
    setCurrent("");
    setNext("");
    setNotice("Kata sandi diganti. Perangkat lain yang masih masuk sudah dikeluarkan; perangkat ini tetap masuk.");
  }

  return (
    <section className="mt-8 flex max-w-md flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-lg font-bold text-text">Ganti kata sandi</h2>
      <form onSubmit={save} noValidate className="flex flex-col gap-4">
        <Field id="pw-current" label="Kata sandi saat ini" type="password" autoComplete="current-password" value={current} error={errors.current} onChange={(e) => setCurrent(e.target.value)} />
        <Field id="pw-next" label="Kata sandi baru" hint="Minimal 10 karakter." type="password" autoComplete="new-password" value={next} error={errors.next} onChange={(e) => setNext(e.target.value)} />
        {error && <Alert>{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        <Button type="submit" loading={saving} className="self-start">
          Simpan kata sandi
        </Button>
      </form>
    </section>
  );
}
