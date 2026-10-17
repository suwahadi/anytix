import { sql } from "@/lib/db";

export const AUDIT_PAGE_SIZE = 50;

export type AuditItem = { id: number; at: Date; adminEmail: string | null; action: string; entity: string; entityId: string | null; diff: unknown };

export async function listAuditLogs(f: { entity?: string; adminId?: number; page: number }): Promise<{ items: AuditItem[]; total: number; entities: string[] }> {
  const entity = f.entity || null;
  const adminId = f.adminId ?? null;
  const page = Math.min(Math.max(1, Math.floor(f.page) || 1), 10_000);
  const where = sql`where (${entity}::text is null or l.entity = ${entity}) and (${adminId}::bigint is null or l.admin_id = ${adminId})`;
  const [items, [{ total }], entities] = await Promise.all([
    sql<AuditItem[]>`
      select l.id, l.created_at as at, a.email as "adminEmail", l.action, l.entity, l.entity_id as "entityId", l.diff
        from audit_logs l left join admins a on a.id = l.admin_id
        ${where}
       order by l.id desc
       limit ${AUDIT_PAGE_SIZE} offset ${(page - 1) * AUDIT_PAGE_SIZE}`,
    sql<{ total: number }[]>`select count(*)::int as total from audit_logs l ${where}`,
    sql<{ entity: string }[]>`select distinct entity from audit_logs order by entity`,
  ]);
  return { items, total, entities: entities.map((e) => e.entity) };
}
