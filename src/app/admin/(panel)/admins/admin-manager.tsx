"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminAccount } from "@/lib/admin/admin-accounts";
import { requestJson } from "@/lib/client-fetch";
import { formatAdminTime } from "../orders/order-labels";

type Pending =
  | { kind: "create" }
  | { kind: "email"; admin: AdminAccount }
  | { kind: "toggle"; admin: AdminAccount }
  | { kind: "reset"; admin: AdminAccount };

export function AdminManager() {
  const [admins, setAdmins] = useState<AdminAccount[] | null>(null);
  const [meId, setMeId] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    requestJson<{ admins: AdminAccount[]; meId: number }>("/api/admin/admins").then((res) => {
      if (!active) return;
      if (!res.ok) return setLoadError(res.error);
      setAdmins(res.data.admins);
      setMeId(res.data.meId);
    });
    return () => {
      active = false;
    };
  }, []);

  function open(next: Pending) {
    setErrors({});
    setFormError("");
    setEmail(next.kind === "email" ? next.admin.email : "");
    setPassword("");
    setPending(next);
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!pending) return;
    setBusy(true);
    setErrors({});
    setFormError("");
    const res =
      pending.kind === "create"
        ? await requestJson<{ admins: AdminAccount[] }>("/api/admin/admins", { body: { email, password } })
        : pending.kind === "reset"
          ? await requestJson<{ admins: AdminAccount[] }>(`/api/admin/admins/${pending.admin.id}/reset-2fa`, { method: "POST", body: {} })
          : await requestJson<{ admins: AdminAccount[] }>(`/api/admin/admins/${pending.admin.id}`, {
              method: "PATCH",
              body: pending.kind === "email" ? { email } : { isActive: !pending.admin.isActive },
            });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fields ?? {});
      return setFormError(res.fields ? "" : res.error);
    }
    setAdmins(res.data.admins);
    setNotice(
      pending.kind === "create"
        ? `Admin ${email.trim().toLowerCase()} ditambahkan. Berikan kata sandinya lewat jalur yang aman.`
        : pending.kind === "reset"
          ? `2FA ${pending.admin.email} dimatikan. Admin bisa mengaktifkannya lagi dari halaman Keamanan.`
          : pending.kind === "email"
            ? "Email admin diganti."
            : pending.admin.isActive
              ? `${pending.admin.email} dinonaktifkan.`
              : `${pending.admin.email} diaktifkan lagi.`,
    );
    setPending(null);
  }

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!admins) return <Skeleton className="mt-6 h-48" />;

  const title =
    pending?.kind === "create"
      ? "Tambah admin"
      : pending?.kind === "email"
        ? "Ganti email admin"
        : pending?.kind === "reset"
          ? "Reset 2FA?"
          : pending?.admin.isActive
            ? "Nonaktifkan admin?"
            : "Aktifkan admin?";

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted">Semua admin punya akses yang sama, termasuk scanner check-in.</p>
        <Button onClick={() => open({ kind: "create" })}>Tambah admin</Button>
      </div>
      {notice && <Alert tone="success">{notice}</Alert>}
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
        {admins.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="break-all font-semibold text-text">{a.email}</span>
                {a.id === meId && <Badge tone="accent">Anda</Badge>}
                {!a.isActive && <Badge>Nonaktif</Badge>}
                <Badge tone={a.has2fa ? "success" : "warning"}>{a.has2fa ? "2FA aktif" : "Tanpa 2FA"}</Badge>
              </div>
              <p className="text-sm text-muted">{a.lastLoginAt ? `Terakhir masuk ${formatAdminTime(a.lastLoginAt)}` : "Belum pernah masuk"}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              <Button variant="ghost" size="sm" onClick={() => open({ kind: "email", admin: a })} aria-label={`Ganti email ${a.email}`}>
                Ganti email
              </Button>
              {a.id !== meId && a.has2fa && (
                <Button variant="ghost" size="sm" onClick={() => open({ kind: "reset", admin: a })} aria-label={`Reset 2FA ${a.email}`}>
                  Reset 2FA
                </Button>
              )}
              {a.id !== meId && (
                <Button variant="ghost" size="sm" onClick={() => open({ kind: "toggle", admin: a })} aria-label={`${a.isActive ? "Nonaktifkan" : "Aktifkan"} ${a.email}`}>
                  {a.isActive ? "Nonaktifkan" : "Aktifkan"}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={pending !== null} onClose={() => setPending(null)} title={title}>
        {pending && (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {(pending.kind === "create" || pending.kind === "email") && (
              <Field id="adm-email" label="Email" type="email" autoComplete="off" value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
            )}
            {pending.kind === "create" && (
              <Field id="adm-password" label="Kata sandi awal" hint="Minimal 10 karakter. Admin bisa menggantinya di halaman Keamanan." type="password" autoComplete="new-password" value={password} error={errors.password} onChange={(e) => setPassword(e.target.value)} />
            )}
            {pending.kind === "reset" && (
              <p className="text-sm text-text">
                2FA <strong>{pending.admin.email}</strong> dimatikan, jadi akun itu bisa masuk hanya dengan email dan kata sandi sampai 2FA diaktifkan lagi. Lakukan ini bila admin kehilangan aplikasi autentikatornya.
              </p>
            )}
            {pending.kind === "toggle" && (
              <p className="text-sm text-text">
                {pending.admin.isActive
                  ? `${pending.admin.email} langsung keluar dari panel dan tidak bisa masuk lagi sampai diaktifkan.`
                  : `${pending.admin.email} bisa masuk lagi dengan kata sandinya.`}
              </p>
            )}
            {formError && <Alert>{formError}</Alert>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setPending(null)}>
                Batal
              </Button>
              <Button type="submit" variant={pending.kind === "toggle" && pending.admin.isActive ? "danger" : "primary"} loading={busy}>
                {pending.kind === "create" ? "Tambah admin" : pending.kind === "email" ? "Simpan email" : pending.kind === "reset" ? "Reset 2FA" : pending.admin.isActive ? "Nonaktifkan" : "Aktifkan"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
