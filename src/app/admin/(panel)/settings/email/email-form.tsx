"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { requestJson } from "@/lib/client-fetch";
import type { SmtpView } from "@/lib/settings-service";
import { useSettings } from "../use-settings";

type Form = Omit<SmtpView, "port"> & { port: string | number; password?: string };

export function EmailForm() {
  const { data, setData, loadError, errors, formError, notice, saving, save } = useSettings<Form>("smtp");
  const [to, setTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [toError, setToError] = useState("");

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!data) return <Skeleton className="mt-6 h-80" />;
  const form = data;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const port = String(form.port).trim() === "" ? undefined : Number(form.port);
    await save({ host: form.host, port, user: form.user, from: form.from, password: form.password ?? "" });
  }

  async function sendTest(e: FormEvent) {
    e.preventDefault();
    setTesting(true);
    setTestResult(null);
    setToError("");
    const res = await requestJson<{ messageId: string }>("/api/admin/settings/smtp/test", { method: "POST", body: { to } });
    setTesting(false);
    if (res.ok) setTestResult({ ok: true, text: `Terkirim ke ${to}. ID pesan: ${res.data.messageId}` });
    else if (res.fields?.to) setToError(res.fields.to);
    else setTestResult({ ok: false, text: res.error });
  }

  return (
    <div className="mt-6 flex max-w-2xl flex-col gap-5">
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
          <div>
            <h2 className="text-lg font-bold text-text">Server SMTP</h2>
            <p className="mt-1 text-sm text-muted">Dipakai untuk email tiket dan pemberitahuan. Selama belum diisi, sistem memakai SMTP dari konfigurasi server.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field id="host" label="Host" autoComplete="off" value={form.host} error={errors.host} onChange={(e) => setData({ ...form, host: e.target.value })} />
            <Field
              id="port"
              label="Port"
              type="number"
              inputMode="numeric"
              value={form.port}
              error={errors.port}
              onChange={(e) => setData({ ...form, port: e.target.value })}
            />
          </div>
          <Field id="user" label="Username" autoComplete="off" value={form.user} error={errors.user} onChange={(e) => setData({ ...form, user: e.target.value })} />
          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            hint={form.hasPassword ? "Tersimpan. Kosongkan bila tidak diubah." : undefined}
            value={form.password ?? ""}
            error={errors.password}
            onChange={(e) => setData({ ...form, password: e.target.value })}
          />
          <Field
            id="from"
            label="Alamat pengirim"
            hint="Contoh: Anytix <noreply@domainanda.com>"
            value={form.from}
            error={errors.from}
            onChange={(e) => setData({ ...form, from: e.target.value })}
          />
        </section>
        {formError && <Alert>{formError}</Alert>}
        {notice && <Alert tone="success">Pengaturan SMTP disimpan.</Alert>}
        <Button type="submit" loading={saving} className="self-start">
          Simpan pengaturan SMTP
        </Button>
      </form>

      <form onSubmit={sendTest} noValidate className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
        <div>
          <h2 className="text-lg font-bold text-text">Kirim email uji</h2>
          <p className="mt-1 text-sm text-muted">Memakai pengaturan yang sudah disimpan.</p>
        </div>
        <Field id="test-to" label="Email penerima" type="email" value={to} error={toError} onChange={(e) => setTo(e.target.value)} />
        {testResult && <Alert tone={testResult.ok ? "success" : "danger"}>{testResult.text}</Alert>}
        <Button type="submit" variant="secondary" loading={testing} className="self-start">
          Kirim email uji
        </Button>
      </form>
    </div>
  );
}
