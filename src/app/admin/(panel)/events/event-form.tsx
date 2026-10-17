"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ImageUpload } from "@/components/image-upload";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select, TextArea } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import type { EventCategory } from "@/lib/catalog/event-category-service";
import type { AdminEvent } from "@/lib/catalog/event-service";
import { requestJson } from "@/lib/client-fetch";
import { FACILITIES } from "@/lib/facilities";
import { TIMEZONES, toIsoFromLocal, toLocalInput } from "@/lib/format";
import { slugify } from "@/lib/slug";
import { TIMEZONE_KEYS, type Timezone } from "@/lib/validation/catalog";

const SOCIALS = [
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "x", label: "X (Twitter)" },
  { key: "facebook", label: "Facebook" },
  { key: "youtube", label: "YouTube" },
  { key: "website", label: "Situs web" },
] as const;

type State = {
  title: string;
  slug: string;
  slugTouched: boolean;
  eventCategoryId: string;
  description: string;
  terms: string;
  refundPolicy: string;
  facilities: string[];
  startsLocal: string;
  endsLocal: string;
  timezone: Timezone;
  venue: string;
  city: string;
  province: string;
  mapUrl: string;
  organizerName: string;
  organizerLogoPath: string | null;
  posterPath: string | null;
  socialLinks: Record<string, string>;
  status: string;
  saleStatus: string;
  isFeatured: boolean;
  seoTitle: string;
  seoDescription: string;
};

const EMPTY: State = {
  title: "",
  slug: "",
  slugTouched: false,
  eventCategoryId: "",
  description: "",
  terms: "",
  refundPolicy: "",
  facilities: [],
  startsLocal: "",
  endsLocal: "",
  timezone: "Asia/Jakarta",
  venue: "",
  city: "",
  province: "",
  mapUrl: "",
  organizerName: "",
  organizerLogoPath: null,
  posterPath: null,
  socialLinks: {},
  status: "draft",
  saleStatus: "closed",
  isFeatured: false,
  seoTitle: "",
  seoDescription: "",
};

function fromEvent(e: AdminEvent): State {
  const tz = e.timezone as Timezone;
  return {
    title: e.title,
    slug: e.slug,
    slugTouched: true,
    eventCategoryId: String(e.eventCategoryId),
    description: e.description,
    terms: e.terms,
    refundPolicy: e.refundPolicy,
    facilities: e.facilities,
    startsLocal: toLocalInput(e.startsAt, tz),
    endsLocal: toLocalInput(e.endsAt, tz),
    timezone: tz,
    venue: e.venue,
    city: e.city,
    province: e.province,
    mapUrl: e.mapUrl ?? "",
    organizerName: e.organizerName,
    organizerLogoPath: e.organizerLogoPath,
    posterPath: e.posterPath,
    socialLinks: e.socialLinks ?? {},
    status: e.status,
    saleStatus: e.saleStatus,
    isFeatured: e.isFeatured,
    seoTitle: e.seo?.title ?? "",
    seoDescription: e.seo?.description ?? "",
  };
}

function Section({ title, children, description }: { title: string; children: ReactNode; description?: string }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-bold text-text">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function EventForm({ eventId }: { eventId?: number }) {
  const router = useRouter();
  const [state, setState] = useState<State | null>(eventId ? null : EMPTY);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [loadError, setLoadError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      requestJson<{ categories: EventCategory[] }>("/api/admin/event-categories"),
      eventId ? requestJson<{ event: AdminEvent }>(`/api/admin/events/${eventId}`) : null,
    ]).then(([cats, ev]) => {
      if (!active) return;
      if (!cats.ok) return setLoadError(cats.error);
      setCategories(cats.data.categories);
      if (ev && !ev.ok) return setLoadError(ev.error);
      if (ev?.ok) {
        setState(fromEvent(ev.data.event));
        if (ev.data.event.status === "published") setPublishedSlug(ev.data.event.slug);
      }
    });
    return () => {
      active = false;
    };
  }, [eventId]);

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!state) {
    return (
      <div className="mt-6 flex flex-col gap-4" aria-busy="true" aria-label="Memuat event">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const form = state;
  const set = <K extends keyof State>(key: K, value: State[K]) => setState({ ...form, [key]: value });
  const tzLabel = TIMEZONES[form.timezone].label;

  function setTitle(title: string) {
    setState({ ...form, title, slug: form.slugTouched ? form.slug : slugify(title) });
  }

  function toggleFacility(key: string, on: boolean) {
    set("facilities", on ? [...form.facilities, key] : form.facilities.filter((f) => f !== key));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError("");
    setNotice("");
    const body = {
      title: form.title,
      slug: form.slug,
      eventCategoryId: form.eventCategoryId ? Number(form.eventCategoryId) : undefined,
      description: form.description,
      terms: form.terms,
      refundPolicy: form.refundPolicy,
      facilities: form.facilities,
      startsAt: form.startsLocal ? toIsoFromLocal(form.startsLocal, form.timezone) : "",
      endsAt: form.endsLocal ? toIsoFromLocal(form.endsLocal, form.timezone) : "",
      timezone: form.timezone,
      venue: form.venue,
      city: form.city,
      province: form.province,
      mapUrl: form.mapUrl,
      organizerName: form.organizerName,
      organizerLogoPath: form.organizerLogoPath,
      posterPath: form.posterPath,
      socialLinks: form.socialLinks,
      status: form.status,
      saleStatus: form.saleStatus,
      isFeatured: form.isFeatured,
      seo: { title: form.seoTitle, description: form.seoDescription },
    };
    const res = eventId
      ? await requestJson<{ event: AdminEvent }>(`/api/admin/events/${eventId}`, { method: "PATCH", body })
      : await requestJson<{ event: AdminEvent }>("/api/admin/events", { body });
    setSaving(false);
    if (!res.ok) {
      setErrors(res.fields ?? {});
      return setFormError(res.error);
    }
    if (!eventId) return router.replace(`/admin/events/${res.data.event.id}`);
    setState(fromEvent(res.data.event));
    setPublishedSlug(res.data.event.status === "published" ? res.data.event.slug : null);
    setNotice("Perubahan disimpan.");
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-5 pb-24">
      <Section title="Informasi dasar">
        <Field id="title" label="Judul event" required value={form.title} error={errors.title} onChange={(e) => setTitle(e.target.value)} />
        <Field
          id="slug"
          label="Slug"
          hint={
            publishedSlug
              ? `Alamat publik: /events/${form.slug || "…"}. Kalau diubah, tautan lama tetap diarahkan ke alamat baru.`
              : `Alamat publik: /events/${form.slug || "…"}. Terisi otomatis dari judul.`
          }
          value={form.slug}
          error={errors.slug}
          onChange={(e) => setState({ ...form, slug: e.target.value, slugTouched: true })}
        />
        <Select
          id="eventCategoryId"
          label="Kategori"
          value={form.eventCategoryId}
          error={errors.eventCategoryId}
          onChange={(e) => set("eventCategoryId", e.target.value)}
          options={[{ value: "", label: "Pilih kategori" }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))]}
        />
        <Checkbox
          id="isFeatured"
          label="Tampilkan sebagai rekomendasi di beranda"
          checked={form.isFeatured}
          onChange={(e) => set("isFeatured", e.target.checked)}
        />
      </Section>

      <Section title="Jadwal" description="Waktu ditulis dalam zona waktu lokasi event.">
        <Select
          id="timezone"
          label="Zona waktu"
          value={form.timezone}
          onChange={(e) => set("timezone", e.target.value as Timezone)}
          options={TIMEZONE_KEYS.map((tz) => ({ value: tz, label: `${TIMEZONES[tz].label} (${tz.replace("Asia/", "")})` }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="startsAt"
            type="datetime-local"
            label={`Mulai (${tzLabel})`}
            value={form.startsLocal}
            error={errors.startsAt}
            onChange={(e) => set("startsLocal", e.target.value)}
          />
          <Field
            id="endsAt"
            type="datetime-local"
            label={`Selesai (${tzLabel})`}
            value={form.endsLocal}
            error={errors.endsAt}
            onChange={(e) => set("endsLocal", e.target.value)}
          />
        </div>
      </Section>

      <Section title="Lokasi">
        <Field id="venue" label="Nama tempat" value={form.venue} error={errors.venue} onChange={(e) => set("venue", e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="city" label="Kota" value={form.city} error={errors.city} onChange={(e) => set("city", e.target.value)} />
          <Field id="province" label="Provinsi" value={form.province} error={errors.province} onChange={(e) => set("province", e.target.value)} />
        </div>
        <Field
          id="mapUrl"
          type="url"
          label="Tautan peta"
          hint="Salin tautan dari Google Maps, diawali https://."
          value={form.mapUrl}
          error={errors.mapUrl}
          onChange={(e) => set("mapUrl", e.target.value)}
        />
      </Section>

      <Section title="Penyelenggara">
        <Field
          id="organizerName"
          label="Nama penyelenggara"
          value={form.organizerName}
          error={errors.organizerName}
          onChange={(e) => set("organizerName", e.target.value)}
        />
        <ImageUpload kind="logo" label="Logo penyelenggara" value={form.organizerLogoPath} onChange={(v) => set("organizerLogoPath", v)} />
      </Section>

      <Section title="Poster" description="Gambar utama di halaman event dan kartu event. Disarankan rasio 16:9, minimal 1600 px lebarnya.">
        <ImageUpload kind="poster" label="Poster" value={form.posterPath} onChange={(v) => set("posterPath", v)} />
      </Section>

      <Section title="Deskripsi">
        <RichTextEditor id="description" label="Deskripsi event" value={form.description} error={errors.description} onChange={(v) => set("description", v)} />
      </Section>

      <Section title="Syarat & ketentuan">
        <RichTextEditor id="terms" label="Syarat & ketentuan" value={form.terms} error={errors.terms} onChange={(v) => set("terms", v)} />
      </Section>

      <Section title="Fasilitas">
        <fieldset>
          <legend className="sr-only">Fasilitas yang tersedia</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {FACILITIES.map((f) => (
              <Checkbox
                key={f.key}
                id={`facility-${f.key}`}
                label={f.label}
                checked={form.facilities.includes(f.key)}
                onChange={(e) => toggleFacility(f.key, e.target.checked)}
              />
            ))}
          </div>
        </fieldset>
      </Section>

      <Section title="Kebijakan refund" description="Tampil sebagai popup di halaman event.">
        <TextArea
          id="refundPolicy"
          label="Isi kebijakan refund"
          rows={5}
          value={form.refundPolicy}
          error={errors.refundPolicy}
          onChange={(e) => set("refundPolicy", e.target.value)}
        />
      </Section>

      <Section title="Media sosial" description="Opsional. Isi alamat lengkap, diawali https://.">
        <div className="grid gap-4 sm:grid-cols-2">
          {SOCIALS.map((s) => (
            <Field
              key={s.key}
              id={`social-${s.key}`}
              type="url"
              label={s.label}
              value={form.socialLinks[s.key] ?? ""}
              error={errors[`socialLinks.${s.key}`]}
              onChange={(e) => set("socialLinks", { ...form.socialLinks, [s.key]: e.target.value })}
            />
          ))}
        </div>
      </Section>

      <Section title="SEO" description="Opsional. Kosongkan untuk memakai judul dan awal deskripsi.">
        <Field
          id="seoTitle"
          label="Judul untuk mesin pencari"
          hint={`${form.seoTitle.length}/70 karakter`}
          value={form.seoTitle}
          error={errors["seo.title"]}
          onChange={(e) => set("seoTitle", e.target.value)}
        />
        <TextArea
          id="seoDescription"
          label="Deskripsi untuk mesin pencari"
          hint={`${form.seoDescription.length}/160 karakter`}
          rows={3}
          value={form.seoDescription}
          error={errors["seo.description"]}
          onChange={(e) => set("seoDescription", e.target.value)}
        />
      </Section>

      <Section title="Status & penjualan">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id="status"
            label="Status event"
            hint="Hanya event terbit yang tampil di situs."
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
            options={[
              { value: "draft", label: "Draf" },
              { value: "published", label: "Terbit" },
              { value: "archived", label: "Arsip" },
            ]}
          />
          <Select
            id="saleStatus"
            label="Penjualan tiket"
            hint="Dijeda atau ditutup menghentikan pembelian baru seketika."
            value={form.saleStatus}
            onChange={(e) => set("saleStatus", e.target.value)}
            options={[
              { value: "on_sale", label: "Dibuka" },
              { value: "paused", label: "Dijeda" },
              { value: "closed", label: "Ditutup" },
            ]}
          />
        </div>
      </Section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur">
        {formError && (
          <p role="alert" className="mr-auto text-sm text-danger">
            {formError}
          </p>
        )}
        {notice && (
          <p role="status" className="mr-auto text-sm text-success">
            {notice}
          </p>
        )}
        <Button type="submit" loading={saving}>
          {eventId ? "Simpan perubahan" : "Buat event"}
        </Button>
      </div>
    </form>
  );
}
