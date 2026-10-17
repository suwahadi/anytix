"use client";

import Image from "next/image";
import { useId, useState, type ChangeEvent } from "react";
import { mediaUrl } from "@/lib/media";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";

export function ImageUpload({
  kind,
  value,
  onChange,
  label,
  hint,
}: {
  kind: "poster" | "logo" | "icon";
  value: string | null;
  onChange: (base: string | null) => void;
  label: string;
  hint?: string;
}) {
  const id = useId();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (file.size > MAX_BYTES) return setError("Ukuran file maksimal 10 MB.");
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    setUploading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch("/api/admin/uploads", { method: "POST", body: form, signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Unggah gagal. Coba lagi.");
      else onChange(data.base);
    } catch {
      setError("Unggah terputus atau terlalu lama. Periksa koneksi lalu coba lagi.");
    } finally {
      clearTimeout(timer);
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-text" id={`${id}-label`}>
        {label}
      </span>
      {value ? (
        <Image
          src={mediaUrl(value, "md")}
          alt={`Pratinjau ${label.toLowerCase()}`}
          width={kind === "poster" ? 320 : 120}
          height={kind === "poster" ? 180 : 120}
          unoptimized
          className="h-auto max-w-full rounded-md border border-border bg-surface-muted object-contain"
        />
      ) : (
        <p className="text-sm text-muted">Belum ada gambar.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={id}
          className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
        >
          {uploading && <Spinner />}
          {uploading ? "Mengunggah…" : value ? "Ganti gambar" : "Pilih gambar"}
          <input
            id={id}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            disabled={uploading}
            onChange={upload}
            aria-describedby={hint ? `${id}-hint` : undefined}
          />
        </label>
        {value && !uploading && (
          <Button variant="ghost" onClick={() => onChange(null)}>
            Hapus gambar
          </Button>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
