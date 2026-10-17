import type { Sql } from "@/lib/db";

export type AuditInput = {
  adminId: number;
  action: string;
  entity: string;
  entityId: string | number;
  diff?: unknown;
};

export async function writeAudit(db: Sql, input: AuditInput): Promise<void> {
  await db`
    insert into audit_logs (admin_id, action, entity, entity_id, diff)
    values (${input.adminId}, ${input.action}, ${input.entity}, ${String(input.entityId)},
            ${input.diff === undefined ? null : db.json(input.diff as never)})`;
}

/** Field-level diff for audit rows: `{ field: [before, after] }` for every changed key in `after`. */
export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) diff[key] = [before[key], after[key]];
  }
  return diff;
}
