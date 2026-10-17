"use client";

import type { FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { PAYMENT_METHODS, type TransactionSettingsValues } from "@/lib/validation/settings";
import { useSettings } from "./use-settings";

type Form = Omit<TransactionSettingsValues, "holdMinutes" | "payMinutes" | "payGraceMinutes" | "serviceFee"> & {
  holdMinutes: string | number;
  payMinutes: string | number;
  payGraceMinutes: string | number;
  serviceFee: string | number;
};

export function TransactionForm() {
  const { data, setData, loadError, errors, formError, notice, saving, save } = useSettings<Form>("transaction");

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!data) return <Skeleton className="mt-6 h-72" />;
  const form = data;
  const num = (v: string | number) => (String(v).trim() === "" ? undefined : Number(v));

  function setMethod(key: string, on: boolean) {
    if (key === "qris") return setData({ ...form, paymentMethods: { ...form.paymentMethods, qris: on } });
    setData({ ...form, paymentMethods: { ...form.paymentMethods, va: { ...form.paymentMethods.va, [key]: on } } });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    await save({
      ...form,
      holdMinutes: num(form.holdMinutes),
      payMinutes: num(form.payMinutes),
      payGraceMinutes: num(form.payGraceMinutes),
      serviceFee: num(form.serviceFee),
    });
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 flex max-w-2xl flex-col gap-5">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-lg font-bold text-text">Batas waktu</h2>
        <Field
          id="holdMinutes"
          label="Lama kunci slot (menit)"
          hint="Waktu pembeli mengisi data dan memilih metode bayar setelah menekan Beli Sekarang. 1–30 menit."
          type="number"
          inputMode="numeric"
          value={form.holdMinutes}
          error={errors.holdMinutes}
          onChange={(e) => setData({ ...form, holdMinutes: e.target.value })}
        />
        <Field
          id="payMinutes"
          label="Batas bayar (menit)"
          hint="Juga dipakai sebagai masa berlaku pembayaran Midtrans. 5–1440 menit."
          type="number"
          inputMode="numeric"
          value={form.payMinutes}
          error={errors.payMinutes}
          onChange={(e) => setData({ ...form, payMinutes: e.target.value })}
        />
        <Field
          id="payGraceMinutes"
          label="Cadangan setelah batas bayar (menit)"
          hint="Tidak terlihat pembeli. Menampung notifikasi pembayaran yang datang terlambat sebelum slot dilepas."
          type="number"
          inputMode="numeric"
          value={form.payGraceMinutes}
          error={errors.payGraceMinutes}
          onChange={(e) => setData({ ...form, payGraceMinutes: e.target.value })}
        />
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-lg font-bold text-text">Biaya layanan</h2>
        <Field
          id="serviceFee"
          label="Biaya layanan per transaksi (Rp)"
          hint="Dikenakan sekali per pesanan, berapa pun jumlah tiketnya. Isi 0 untuk tanpa biaya."
          type="number"
          inputMode="numeric"
          value={form.serviceFee}
          error={errors.serviceFee}
          onChange={(e) => setData({ ...form, serviceFee: e.target.value })}
        />
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
        <div>
          <h2 className="text-lg font-bold text-text">Metode pembayaran</h2>
          <p className="mt-1 text-sm text-muted">Metode yang dimatikan tidak tampil di halaman pembayaran.</p>
        </div>
        <fieldset className="grid gap-3 sm:grid-cols-2" aria-describedby={errors.paymentMethods ? "methods-error" : undefined}>
          <legend className="sr-only">Metode pembayaran aktif</legend>
          {PAYMENT_METHODS.map((m) => (
            <Checkbox
              key={m.key}
              id={`method-${m.key}`}
              label={m.key === "qris" ? "QRIS" : `Transfer Bank ${m.label}`}
              checked={m.key === "qris" ? form.paymentMethods.qris : Boolean(form.paymentMethods.va[m.key])}
              onChange={(e) => setMethod(m.key, e.target.checked)}
            />
          ))}
        </fieldset>
        {errors.paymentMethods && (
          <p id="methods-error" className="text-sm text-danger">
            {errors.paymentMethods}
          </p>
        )}
      </section>

      {formError && <Alert>{formError}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      <Button type="submit" loading={saving} className="self-start">
        Simpan pengaturan transaksi
      </Button>
    </form>
  );
}
