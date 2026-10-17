"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { requestJson } from "@/lib/client-fetch";
import { Alert, Button, Field } from "../ui";

type Next = { next: "done" | "2fa" };

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"credentials" | "code">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function submitCredentials(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await requestJson<Next>("/api/admin/auth/login", { body: { email, password } });
    setLoading(false);
    if (!res.ok) return setError(res.error);
    if (res.data.next === "2fa") return setStep("code");
    router.replace("/admin");
    router.refresh();
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await requestJson<Next>("/api/admin/auth/2fa", { body: { code } });
    setLoading(false);
    if (!res.ok) {
      if (res.status === 401 && res.error.startsWith("Sesi masuk berakhir")) setStep("credentials");
      return setError(res.error);
    }
    router.replace("/admin");
    router.refresh();
  }

  if (step === "code") {
    return (
      <form onSubmit={submitCode} className="flex flex-col gap-4" noValidate>
        <Field
          ref={codeRef}
          id="code"
          label="Kode autentikator"
          hint="Buka aplikasi autentikator di ponsel, lalu masukkan 6 digit kode untuk Anytix."
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={loading} disabled={code.length !== 6}>
          Verifikasi kode
        </Button>
        <Button type="button" variant="secondary" onClick={() => (setStep("credentials"), setCode(""), setError(""))}>
          Kembali
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={submitCredentials} className="flex flex-col gap-4" noValidate>
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="username"
        placeholder="email@domain.com"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Field
        id="password"
        label="Kata sandi"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <Alert>{error}</Alert>}
      <Button type="submit" loading={loading} disabled={!email || !password}>
        Masuk
      </Button>
    </form>
  );
}
