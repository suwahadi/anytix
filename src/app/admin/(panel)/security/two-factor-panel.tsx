"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { requestJson, type FetchResult } from "@/lib/client-fetch";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

type Setup = { enabled: true } | { enabled: false; secret: string; uri: string; qr: string };

const fetchSetup = () => requestJson<Setup>("/api/admin/auth/2fa/setup");

export function TwoFactorPanel() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [loadError, setLoadError] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  function apply(res: FetchResult<Setup>) {
    if (res.ok) setSetup(res.data);
    else setLoadError(res.error);
  }

  async function load() {
    setLoadError("");
    setSetup(null);
    apply(await fetchSetup());
  }

  useEffect(() => {
    let active = true;
    fetchSetup().then((res) => {
      if (!active) return;
      if (res.ok) setSetup(res.data);
      else setLoadError(res.error);
    });
    return () => {
      active = false;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!setup) return;
    setError("");
    setNotice("");
    setSaving(true);
    const res = setup.enabled
      ? await requestJson("/api/admin/auth/2fa/setup", { method: "DELETE", body: { code } })
      : await requestJson("/api/admin/auth/2fa/setup", { body: { secret: setup.secret, code } });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    setCode("");
    setNotice(setup.enabled ? "Verifikasi dua langkah dimatikan." : "Verifikasi dua langkah aktif. Kode diminta di setiap login berikutnya.");
    await load();
  }

  return (
    <section aria-labelledby="two-factor-title" className="mt-6 max-w-xl rounded-lg border border-border bg-surface p-5">
      <h2 id="two-factor-title" className="text-lg font-semibold text-text">
        Verifikasi dua langkah
      </h2>
      {notice && (
        <p role="status" className="mt-3 rounded-md border border-success bg-success-soft px-3 py-2 text-sm text-success">
          {notice}
        </p>
      )}

      {!setup && !loadError && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Spinner /> Memuat status verifikasi dua langkah…
        </p>
      )}

      {loadError && (
        <div className="mt-3 flex flex-col items-start gap-3">
          <Alert>{loadError}</Alert>
          <Button variant="secondary" onClick={load}>
            Muat ulang status
          </Button>
        </div>
      )}

      {setup?.enabled && (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-4" noValidate>
          <p className="text-sm text-text">
            Aktif. Setiap kali masuk, panel meminta kode dari aplikasi autentikator di ponsel Anda. Untuk mematikannya,
            masukkan kode yang sedang tampil di aplikasi.
          </p>
          <CodeField value={code} onChange={setCode} error={error} />
          <Button type="submit" variant="secondary" loading={saving} disabled={code.length !== 6} className="self-start">
            Matikan verifikasi dua langkah
          </Button>
        </form>
      )}

      {setup && !setup.enabled && (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-4" noValidate>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-text">
            <li>Pindai kode QR di bawah dengan aplikasi autentikator, misalnya Google Authenticator atau Authy.</li>
            <li>Masukkan 6 digit kode yang muncul di aplikasi, lalu aktifkan.</li>
          </ol>
          <Image
            src={setup.qr}
            alt="Kode QR untuk aplikasi autentikator"
            width={200}
            height={200}
            unoptimized
            className="rounded-md bg-white p-2"
          />
          <p className="text-sm text-muted">
            Tidak bisa memindai? Ketik kunci ini di aplikasi:{" "}
            <code className="break-all rounded bg-surface-muted px-1.5 py-0.5 text-text">
              {setup.secret}
            </code>
          </p>
          <CodeField value={code} onChange={setCode} error={error} />
          <Button type="submit" loading={saving} disabled={code.length !== 6} className="self-start">
            Aktifkan verifikasi dua langkah
          </Button>
        </form>
      )}
    </section>
  );
}

function CodeField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error: string }) {
  return (
    <Field
      id="totp-code"
      label="Kode 6 digit"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      required
      value={value}
      error={error}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
    />
  );
}
