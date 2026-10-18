import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { pageAdmin } from "@/lib/admin-page";
import { AUDIT_PAGE_SIZE, listAuditLogs } from "@/lib/admin/audit-log";
import { formatAdminTime } from "../orders/order-labels";
import { AdminTabs } from "../admins/admin-tabs";

export const metadata: Metadata = { title: "Audit log", robots: { index: false, follow: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function AuditList({ searchParams }: { searchParams: Search }) {
  await pageAdmin();
  const sp = await searchParams;
  const entity = one(sp.entity);
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const { items, total, entities } = await listAuditLogs({ entity: entity || undefined, page });
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const href = (p: number) => `/admin/audit?${new URLSearchParams({ ...(entity && { entity }), page: String(p) })}`;

  return (
    <div className="mt-6 flex flex-col gap-4">
      <form method="get" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-col gap-1.5 sm:w-64">
          <label htmlFor="audit-entity" className="text-sm font-medium text-text">
            Jenis data
          </label>
          <select id="audit-entity" name="entity" defaultValue={entity} className="h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-text">
            <option value="">Semua</option>
            {entities.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonClass("secondary")}>
          Tampilkan
        </button>
      </form>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong p-6 text-center text-muted">Belum ada catatan.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {items.map((i) => (
            <li key={i.id} className="flex flex-col gap-1.5 px-4 py-3 text-sm sm:flex-row sm:items-start sm:gap-6">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="font-semibold text-text">
                  {i.action} · {i.entity}
                  {i.entityId && ` #${i.entityId}`}
                </p>
                {i.diff !== null && i.diff !== undefined && (
                  <details>
                    <summary className="inline-flex min-h-9 cursor-pointer items-center text-muted">Rincian perubahan</summary>
                    <pre className="mt-1 overflow-x-auto rounded-md bg-surface-muted p-2 text-xs text-text">{JSON.stringify(i.diff, null, 2)}</pre>
                  </details>
                )}
              </div>
              <p className="flex flex-col text-muted sm:shrink-0 sm:text-right">
                <span className="tabular-nums">{formatAdminTime(i.at)}</span>
                <span className="break-all">{i.adminEmail ?? "sistem"}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label="Halaman audit log" className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={href(page - 1)} className={buttonClass("secondary", "sm")}>
              Sebelumnya
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted">
            Halaman {page} dari {pages}
          </span>
          {page < pages ? (
            <Link href={href(page + 1)} className={buttonClass("secondary", "sm")}>
              Berikutnya
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

export default function AuditPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <h1 className="text-2xl font-bold text-text">Admin &amp; Audit</h1>
      <AdminTabs active="audit" />
      <Suspense fallback={<Skeleton className="mt-6 h-64" />}>
        <AuditList searchParams={searchParams} />
      </Suspense>
    </>
  );
}
